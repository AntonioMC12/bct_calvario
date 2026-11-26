import { actionLink, area, attendanceBadge, back, bindForm, button, dateOnly, dayKey, displayTime, empty, errorRegion, esc, eventCard, field, fullDate,
  header, icon, instrument, intention, normalize, options, otherIntention, pill, presence, row, sectionTitle, segment, timeRange } from './ui.js';
import { canManage } from './roles.js';

const today = () => dayKey(new Date());
let selected = today();
let mode = 'month';
const manager = state => !state.offline && canManage(state.member.role);
const eventHref = id => '#/calendario/' + id;

function changeMonth(direction) {
  const [year, month] = selected.split('-').map(Number);
  selected = new Date(Date.UTC(year, month - 1 + direction, 1)).toISOString().slice(0,10);
}

export function calendar(content, ctx, focus) {
  const { state } = ctx;
  const visible = state.data.events.filter(event => dayKey(event.starts).slice(0,7) === selected.slice(0,7));
  const byDay = Map.groupBy(visible, event => dayKey(event.starts));
  const [year, month] = selected.split('-').map(Number);
  const startDay = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(startDay);
  const days = new Date(Date.UTC(year,month,0)).getUTCDate();
  const blanks = (startDay.getUTCDay() + 6) % 7;
  const previousDays = new Date(Date.UTC(year,month - 1,0)).getUTCDate();
  const trailing = (7 - (days + blanks) % 7) % 7;
  const inactiveDay = value => '<span class="inactive-day" aria-hidden="true">' + value + '</span>';
  const calendarGrid = mode === 'month' ? '<div class="month-grid">' +
    ['L','M','X','J','V','S','D'].map(label => '<span class="weekday" aria-hidden="true">' + label + '</span>').join('') +
    Array.from({length:blanks}, (_, i) => inactiveDay(previousDays - blanks + i + 1)).join('') +
    Array.from({length:days}, (_, i) => {
      const key = selected.slice(0,8) + String(i + 1).padStart(2,'0');
      const dayEvents = byDay.get(key) ?? [];
      const count = dayEvents.length;
      const dots = (dayEvents.some(event => !event.cancelled && event.type === 'Ensayo') ? '<i class="dot-rehearsal"></i>' : '') +
        (dayEvents.some(event => !event.cancelled && event.type !== 'Ensayo') ? '<i class="dot-event"></i>' : '') +
        (dayEvents.some(event => event.cancelled) ? '<i class="dot-cancelled"></i>' : '');
      return '<button type="button" class="day" data-day="' + key + '" aria-label="' + dateOnly(key) +
        (count ? ', ' + count + ' evento' + (count === 1 ? '' : 's') : '') + '" aria-pressed="' + (key === selected) + '"' +
        (key === today() ? ' aria-current="date"' : '') + '><span>' + (i + 1) + '</span>' +
        (dots ? '<span class="calendar-dots" aria-hidden="true">' + dots + '</span>' : '') + '</button>';
    }).join('') + Array.from({length:trailing}, (_, i) => inactiveDay(i + 1)).join('') + '</div>' +
    '<div class="calendar-legend"><span><i class="dot-rehearsal"></i>Ensayo</span><span><i class="dot-event"></i>Acto o concierto</span>' +
    (visible.some(event => event.cancelled) ? '<span><i class="dot-cancelled"></i>Cancelado</span>' : '') + '</div>' : '';
  const upcoming = visible.filter(event => Date.parse(event.starts) > Date.now() && !event.cancelled);
  const past = visible.filter(event => !upcoming.includes(event)).reverse();
  const cards = list => list.map(event => eventCard(event, state.pending[event.id])).join('');
  const daily = byDay.get(selected) ?? [];
  const schedule = mode === 'month' ? sectionTitle(dateOnly(selected),
    daily.length ? pill(daily.length + (daily.length === 1 ? ' evento' : ' eventos')) : '', 'calendario') +
    (daily.length ? cards(daily) : empty('No hay eventos este día.')) :
    (visible.length ? (upcoming.length ? '<div class="schedule-group">' + sectionTitle('Próximos') + cards(upcoming) + '</div>' : '') +
    (past.length ? '<div class="schedule-group">' + sectionTitle('Pasados y cancelados') + cards(past) + '</div>' : '') :
      empty('No hay eventos este mes.'));
  content.innerHTML = '<div class="calendar-view">' + header('Calendario','',
    manager(state) ? '<a class="button primary" href="#/calendario/nuevo">' + icon('plus') + 'Nuevo evento</a>' : '') +
    segment('Vista de calendario',[['month','Mes','grid'],['list','Lista','list']],mode) +
    '<div class="calendar-layout' + (mode === 'list' ? ' calendar-list' : '') + '"><section class="card calendar-card">' +
    '<div class="calendar-head"><div class="month-controls"><button type="button" id="previous" aria-label="Mes anterior">' + icon('left') +
    '</button><h2 aria-live="polite">' + monthLabel[0].toUpperCase() + monthLabel.slice(1) +
    '</h2><button type="button" id="next" aria-label="Mes siguiente">' + icon('right') + '</button></div>' +
    '<button type="button" id="today" class="button quiet">Hoy</button></div>' + calendarGrid + '</section>' +
    '<section class="schedule">' + schedule + '</section></div></div>';
  content.querySelector('#previous').onclick = () => { changeMonth(-1); calendar(content,ctx,'#previous'); };
  content.querySelector('#next').onclick = () => { changeMonth(1); calendar(content,ctx,'#next'); };
  content.querySelector('#today').onclick = () => { selected = today(); calendar(content,ctx,'#today'); };
  content.querySelector('.segments').onclick = event => {
    const value = event.target.closest('button')?.dataset.value;
    if (value) { mode = value; calendar(content,ctx,'.segments [aria-pressed="true"]'); }
  };
  content.querySelector('.month-grid')?.addEventListener('click', event => {
    const day = event.target.closest('button')?.dataset.day;
    if (day) { selected = day; calendar(content,ctx,'.day[aria-pressed="true"]'); }
  });
  if (focus) content.querySelector(focus)?.focus();
}

export async function eventPage(content, ctx, id, action) {
  const { state, api } = ctx;
  let event = state.data.events.find(item => item.id === id);
  if (!event) {
    content.innerHTML = back('Calendario','#/calendario') + empty('No se encuentra el evento.');
    return;
  }
  const href = eventHref(id);
  const prev = back('Calendario','#/calendario');
  let detail = null;
  if (!state.offline) {
    content.innerHTML = prev + header(event.title) + '<p class="muted" role="status">Cargando convocatoria…</p>';
    try {
      detail = await api('/events/' + id);
      event = detail.event;
    } catch (error) {
      if (!error.network) throw error;
      ctx.networkFailure(error);
    }
  }
  const open = !event.cancelled && Date.parse(event.starts) > Date.now();

  if (action === 'responder') return respond(content,ctx,event,open);
  if (action === 'asistentes' || action === 'pasar-lista' || action === 'corregir') {
    const titles = { asistentes:'Asistentes', 'pasar-lista':'Pasar lista', corregir:'Corregir intención' };
    content.innerHTML = back('Evento',href) + header(titles[action],event.title);
    if (!detail) {
      content.insertAdjacentHTML('beforeend',empty('Necesitas conexión para consultar la lista.'));
    } else if (action === 'asistentes') {
      attendees(content, detail.roster, manager(state));
    } else if (action === 'corregir' && manager(state)) {
      corrections(content,ctx,event,detail.roster.filter(member => member.active && member.id !== state.member.id));
    } else if (action === 'pasar-lista' && manager(state)) {
      if (event.cancelled || !event.roll_call) {
        content.insertAdjacentHTML('beforeend',empty(event.cancelled ?
          'La convocatoria está cancelada.' : 'La lista de presencia se activa al editar este evento.'));
      } else if (open) {
        content.insertAdjacentHTML('beforeend','<section class="card stack"><h2>La lista se abre al comenzar</h2><p class="muted">' +
          displayTime(event.starts) + ' · Hora de Madrid</p></section>');
      } else {
        rollCall(content,ctx,event,detail.roster.filter(member => member.active));
      }
    } else {
      content.insertAdjacentHTML('beforeend',empty('Esta acción requiere permisos de gestión y depende del estado del evento.'));
    }
    return;
  }
  const pending = state.pending[id];
  const roster = detail?.roster ?? [];
  const counts = Object.fromEntries([...Map.groupBy(roster, member => member.intention)].map(([value, items]) => [value, items.length]));
  const places = [event.location,event.town].filter(Boolean).join(' · ');
  const map = encodeURIComponent([event.location,event.town].filter(Boolean).join(', '));
  const responses = (counts.yes ?? 0) + ' asistirán · ' + (counts.no ?? 0) + ' no asistirán · ' + (counts.unset ?? 0) + ' sin confirmar';
  content.innerHTML = '<div class="event-view">' + prev + '<div class="event-layout">' +
    '<section class="card stack event-overview">' + header(event.title, '',
      manager(state) && !event.cancelled ? actionLink('Editar',href + '/editar') : '', event.type) +
    (event.cancelled ? '<div class="callout"><strong>Evento cancelado</strong><p>La convocatoria se conserva en el historial.</p></div>' : '') +
    (manager(state) && event.roll_call && !event.cancelled ? '<div class="event-roll-action">' +
      '<a class="button primary event-action" href="' + href + '/pasar-lista">' + icon('clipboard') + 'Pasar lista</a>' +
      (open ? '<p class="muted">La lista se abre al comenzar la convocatoria.</p>' : '') + '</div>' : '') +
    (event.description ? '<p class="pre">' + esc(event.description) + '</p>' : '') +
    '<div class="event-facts"><div class="info-line"><span class="tile">' + icon('clock') + '</span><div><strong>' + fullDate(event.starts) +
    '</strong><p class="muted">' + timeRange(event) + ' · Hora de Madrid · Fin aproximado</p></div></div>' +
    (places ? '<div class="info-line"><span class="tile">' + icon('map') + '</span><div><strong>' +
      esc(event.location || event.town) + '</strong>' +
      (event.location && event.town ? '<p class="muted">' + esc(event.town) + '</p>' : '') + '</div></div>' : '') +
    (event.meeting ? '<div class="info-line"><span class="tile">' + icon('compass') + '</span><div><strong>Punto de encuentro</strong>' +
      '<p class="muted pre">' + esc(event.meeting) + '</p></div></div>' : '') + '</div>' +
    (map && !state.offline ? '<iframe class="event-map" title="Mapa de ' + esc(places) + '" loading="lazy" referrerpolicy="no-referrer" ' +
      'src="https://www.google.com/maps?q=' + map + '&amp;output=embed&amp;hl=es"></iframe>' : '') +
    (map && state.offline ? '<p class="muted">El mapa necesita conexión.</p>' : '') +
    (map || detail ? '<div class="event-location-actions">' +
      (map ? '<a class="button primary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&amp;query=' +
        map + '">' + icon('compass') + 'Abrir en mapas</a>' : '') +
      (detail ? '<a class="button quiet" href="/api/events/' + id + '/calendar">' + icon('calendario') + 'Exportar .ics</a>' : '') + '</div>' : '') +
    (detail ? '<p class="event-description muted">La exportación crea una copia. Consulta aquí los cambios posteriores.</p>' : '') +
    '</section><div class="stack event-side"><section class="card stack event-attendance"><div class="event-labels"><h2>' +
    icon('clipboard') + 'Mi asistencia</h2>' +
    attendanceBadge(event.intention) + '</div>' +
    (pending ? '<div class="callout queue"><strong>' + (pending.error ? 'Cambio sin enviar' : 'Pendiente de envío') +
      '</strong><p>Tu selección local: ' + intention[pending.value] + '</p>' +
      (pending.error ? '<p>' + esc(pending.error) + '</p>' : '') +
      button('Retirar cambio local','secondary','id="discard"') + '</div>' : '') +
    (event.reason ? '<p class="muted pre">Motivo privado: ' + esc(event.reason) + '</p>' : '') +
    '<p class="event-description muted">' + icon('clock') + (open ? 'Puedes responder hasta el inicio del evento.' :
      'Las respuestas están cerradas para este evento.') + '</p>' +
    (open ? '<a class="button primary event-action" href="' + href + '/responder"><span>' + icon('clipboard') +
      'Responder asistencia</span>' + icon('arrow') + '</a>' : '') +
    '</section>' + (detail ? '<div class="row-list event-links">' +
    row('Asistentes',responses,href + '/asistentes','users') +
    (manager(state) ? row('Corregir intención','Revisar respuestas y motivos',href + '/corregir','perfil') +
      row('Formación','Editar posiciones y plantillas',href + '/formacion','grid') : '') +
    '</div>' : '') + '</div>' + (detail ? '<section class="card stack event-documents"><h2>' + icon('folder') + 'Documentación</h2>' +
    (detail.attachments.length ? '<div class="row-list">' + detail.attachments.map(file => row(file.name,'PDF','/api/files/' + file.id,'file')).join('') + '</div>' :
      '<p class="muted">Sin documentos adjuntos.</p>') +
    '</section>' : '') + '</div></div>';
  content.querySelector('#discard')?.addEventListener('click', () => {
    ctx.setPending(id,null);
    ctx.render();
  });
}

function respond(content, ctx, event, open) {
  const href = eventHref(event.id);
  const pending = ctx.state.pending[event.id];
  const selected = pending?.value ?? event.intention;
  content.innerHTML = back('Evento',href) + header('Mi asistencia',event.title) +
    (!open ? empty('Las respuestas están cerradas.') : '<form class="card stack respond"><fieldset><legend>Selecciona tu respuesta</legend>' +
      Object.entries(intention).map(([value,label]) => '<label class="choice"><input type="radio" name="value" value="' + value + '"' +
        (value === selected ? ' checked' : '') + '><span>' + label + '</span></label>').join('') +
      '</fieldset><div id="reason">' + area('reason','Motivo de ausencia (opcional)','maxlength="500"',pending?.reason ?? event.reason) +
      '<p class="muted">Solo tú y Dirección podéis ver el motivo.</p></div>' + errorRegion +
      button('Guardar respuesta') + '</form>');
  const form = content.querySelector('form');
  if (!form) return;
  const reason = form.querySelector('#reason');
  function toggleReason() {
    reason.hidden = form.elements.value.value !== 'no';
    reason.querySelector('textarea').disabled = reason.hidden;
  }
  form.addEventListener('change',toggleReason);
  toggleReason();
  bindForm(form, async input => {
    await ctx.respond(event,input.value,input.reason ?? '');
    ctx.go(href);
  });
}

function attendees(content, members, showSummary) {
  const filters = [['all','Todos'],['yes','Asistirán'],['no','No asistirán'],['unset','Sin confirmar']];
  const totals = Map.groupBy(members, member => member.intention);
  let mode = 'all';
  content.insertAdjacentHTML('beforeend', '<div class="stack">' +
    '<div class="segments attendee-filters" role="group" aria-label="Filtrar asistentes">' +
    filters.map(([value,label]) => '<button type="button" data-value="' + value + '" aria-pressed="' + (value === mode) + '">' +
      '<span>' + label + '</span> <span class="attendee-count">' +
      (value === 'all' ? members.length : totals.get(value)?.length ?? 0) + '</span></button>').join('') + '</div>' +
    field('query','Buscar componente','type="search" autocomplete="off" placeholder="Nombre o instrumento"') +
    '<div id="roster" class="row-list attendee-roster"></div>' +
    (showSummary ? summary(members) : '') + '</div>');
  const search = content.querySelector('input');
  const groups = content.querySelector('.segments');
  const list = content.querySelector('#roster');
  function show() {
    const visible = members.filter(member => (member.intention === mode || mode === 'all') &&
      normalize(member.name + ' ' + member.instrument + ' ' + member.voice).includes(normalize(search.value)));
    list.innerHTML = visible.length ? visible.map(member => {
      const part = instrument(member);
      return '<div class="row"><div class="row-copy"><strong>' + esc(member.name) + '</strong>' +
        (part ? '<span class="muted">' + part + '</span>' : '') + '</div>' +
        pill(otherIntention[member.intention],member.intention === 'yes' ? 'good' : '') + '</div>';
    }).join('') : empty('No hay componentes con esos filtros.');
  }
  groups.onclick = event => {
    const chosen = event.target.closest('button');
    if (!chosen) return;
    mode = chosen.dataset.value;
    for (const control of groups.querySelectorAll('button')) control.setAttribute('aria-pressed',String(control === chosen));
    show();
  };
  search.oninput = show;
  show();
}

function summary(members) {
  const groups = Map.groupBy(members, member => [member.instrument,member.voice].filter(Boolean).join(' · ') || 'Sin instrumento');
  return '<details class="card"><summary>Resumen por instrumento y voz</summary><div class="report-scroll"><table><thead><tr>' +
    ['Instrumento y voz','Asistirán','No asistirán','Sin confirmar','Presentes','No presentes','Sin registrar']
      .map(label => '<th scope="col">' + label + '</th>').join('') + '</tr></thead><tbody>' +
    [...groups].map(([key, rows]) => '<tr><th scope="row">' + esc(key) + '</th>' +
      ['yes','no','unset'].map(value => '<td>' + rows.filter(row => row.intention === value).length + '</td>').join('') +
      ['present','absent','unset'].map(value => '<td>' + rows.filter(row => row.presence === value).length + '</td>').join('') +
      '</tr>').join('') + '</tbody></table></div></details>';
}

function rollCall(content, ctx, event, members) {
  if (!members.length) { content.insertAdjacentHTML('beforeend',empty('No hay componentes activos para pasar lista.')); return; }
  const values = new Map(members.map(member => [member.id,member.presence]));
  const status = [['present','Presente'],['absent','No presente'],['unset','Sin registrar']];
  content.insertAdjacentHTML('beforeend','<form class="stack roll-call"><section class="card stack"><p class="muted">' +
    'La presencia se registra por separado de la intención.</p><dl id="roll-totals" class="metrics"></dl>' +
    '<div class="field-grid">' + field('query','Buscar por nombre o instrumento','type="search" autocomplete="off"') +
    '<label>Estado de presencia<select name="filter"><option value="all">Todos</option>' + options(presence) + '</select></label></div>' +
    button('Marcar presentes los pendientes visibles','quiet','type="button" id="roll-bulk"') +
    '</section><div id="roll-list" class="stack"></div><div class="card roll-save">' + errorRegion +
    '<p id="roll-changes" class="muted" role="status"></p>' + button('Guardar presencia') + '</div></form>');
  const form = content.querySelector('.roll-call');
  const list = form.querySelector('#roll-list');
  const filter = () => members.filter(member => (form.elements.filter.value === 'all' ||
    values.get(member.id) === form.elements.filter.value) && normalize([member.name, member.instrument, member.voice].join(' '))
    .includes(normalize(form.elements.query.value)));
  const changes = () => members.filter(member => member.presence !== values.get(member.id));
  function drawSummary() {
    const counts = Map.groupBy(values.values(), value => value);
    const facts = [['Total',members.length],['Presentes', counts.get('present')?.length ?? 0],
      ['No presentes',counts.get('absent')?.length ?? 0],['Sin registrar',counts.get('unset')?.length ?? 0]];
    form.querySelector('#roll-totals').innerHTML = facts.map(([label,count]) => '<div><dt>' + label + '</dt><dd>' + count + '</dd></div>').join('');
    form.querySelector('#roll-changes').textContent = changes().length + ' cambios por guardar';
    form.querySelector('#roll-bulk').disabled = !filter().some(member => values.get(member.id) === 'unset');
  }
  function draw() {
    const visible = filter();
    list.innerHTML = visible.length ? visible.map(member => '<article class="card roll-person"><div class="event-labels">' +
      '<div><h2>' + esc(member.name) + '</h2><p class="muted">' + instrument(member) + '</p></div>' + pill(otherIntention[member.intention]) + '</div>' +
      (member.reason ? '<p class="muted pre">Motivo privado: ' + esc(member.reason) + '</p>' : '') +
      '<fieldset class="roll-options" data-person="' + esc(member.id) + '"><legend class="sr-only">Presencia de ' + esc(member.name) + '</legend>' +
      status.map(([key,label]) => '<label class="choice"><input type="radio" name="person-' + esc(member.id) + '" value="' + key +
        '"' + (values.get(member.id) === key ? ' checked' : '') + '><span>' + label + '</span></label>').join('') + '</fieldset></article>').join('') :
      empty('No hay componentes con esos filtros.');
    drawSummary();
  }
  form.elements.query.oninput = draw;
  form.elements.filter.onchange = draw;
  list.onchange = ({target}) => {
    const person = target.closest('[data-person]');
    if (!person || !values.has(person.dataset.person)) return;
    values.set(person.dataset.person,target.value);
    // Keep focus and visible selection until the filters change.
    drawSummary();
  };
  form.querySelector('#roll-bulk').onclick = async () => {
    const pending = filter().filter(member => values.get(member.id) === 'unset');
    if (!pending.length || !await ctx.confirmAction('¿Marcar como presentes?', 'Se marcarán ' + pending.length + ' componentes visibles sin registrar.', 'Marcar presentes')) return;
    pending.forEach(member => values.set(member.id,'present'));
    draw();
  };
  draw();
  bindForm(form, async () => {
    const rows = changes().map(member => ({ id:member.id, value:values.get(member.id) }));
    if (!rows.length) { ctx.toast('No hay cambios de presencia por guardar'); return; }
    await ctx.api('/events/' + event.id + '/presence','PUT',{ rows });
    await ctx.refresh();
    ctx.toast('Presencia guardada');
    ctx.go(eventHref(event.id));
  });
}

function corrections(content, ctx, event, members) {
  if (!members.length) {
    content.insertAdjacentHTML('beforeend',empty('No hay otros componentes activos.'));
    return;
  }
  content.insertAdjacentHTML('beforeend','<form class="card stack"><label>Componente<select name="person">' +
    options(Object.fromEntries(members.map(member => [member.id,member.name]))) + '</select></label>' +
    '<p id="private-reason" class="muted pre"></p><label>Intención<select name="value">' +
    options(otherIntention) + '</select></label>' + errorRegion + button('Guardar corrección') + '</form>');
  const form = content.querySelector('form');
  const current = () => members.find(member => member.id === form.elements.person.value);
  const selectMember = () => {
    const member = current();
    form.elements.value.value = member.intention;
    form.querySelector('#private-reason').textContent = member.reason ? 'Motivo privado: ' + member.reason : 'Sin motivo registrado.';
  };
  form.elements.person.onchange = selectMember;
  selectMember();
  bindForm(form,async input => {
    const member = current();
    if (!await ctx.confirmAction('¿Corregir la intención?', member.name + ' · ' + otherIntention[input.value], 'Guardar corrección')) return;
    await ctx.api('/events/' + event.id + '/intention/' + member.id,'PUT',{
      value:input.value,version:member.intention_version,
    });
    await ctx.refresh();
    ctx.toast('Corrección guardada');
    ctx.go(eventHref(event.id));
  });
}
