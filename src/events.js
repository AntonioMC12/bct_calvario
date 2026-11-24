import { area, attendanceBadge, back, bindForm, button, dateOnly, dayKey, empty, errorRegion, esc, eventCard, field, fullDate, header, icon,
  instrument, intention, link, normalize, options, otherIntention, pill, presence, row, sectionTitle, segment, timeRange } from './ui.js';

const today = () => dayKey(new Date());
let selected = today();
let mode = 'month';
const manager = state => ['admin','director'].includes(state.member.role) && !state.offline;
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
      const count = byDay.get(key)?.length ?? 0;
      return '<button type="button" class="day" data-day="' + key + '" aria-label="' + dateOnly(key) +
        (count ? ', ' + count + ' evento' + (count === 1 ? '' : 's') : '') + '" aria-pressed="' + (key === selected) + '"' +
        (key === today() ? ' aria-current="date"' : '') + '><span>' + (i + 1) + '</span>' +
        (count ? '<i aria-hidden="true"></i>' : '') + '</button>';
    }).join('') + Array.from({length:trailing}, (_, i) => inactiveDay(i + 1)).join('') + '</div>' : '';
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
    segment('Vista de calendario',[['month','Mes','calendario'],['list','Lista','list']],mode) +
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
      attendees(content, detail.roster, state.member.role === 'director');
    } else if (action === 'corregir' && state.member.role === 'director') {
      corrections(content,ctx,event,detail.roster.filter(member => member.active && member.id !== state.member.id));
    } else if (action === 'pasar-lista' && state.member.role === 'director' && !event.cancelled && !open) {
      rollCall(content,ctx,event,detail.roster.filter(member => member.active));
    } else {
      content.insertAdjacentHTML('beforeend',empty('Esta acción está reservada a dirección y depende del estado del evento.'));
    }
    return;
  }
  const pending = state.pending[id];
  const roster = detail?.roster ?? [];
  const counts = Object.fromEntries([...Map.groupBy(roster, member => member.intention)].map(([value, items]) => [value, items.length]));
  const places = [event.location,event.town].filter(Boolean).join(' · ');
  const map = [event.meeting || event.location,event.town].filter(Boolean).join(', ');
  const responses = (counts.yes ?? 0) + ' asistirán · ' + (counts.no ?? 0) + ' no asistirán · ' + (counts.unset ?? 0) + ' sin confirmar';
  content.innerHTML = '<div class="event-view">' + prev + '<div class="event-layout">' +
    '<section class="card stack event-overview">' + header(event.title, '',
      manager(state) && !event.cancelled ? link('Editar',href + '/editar') : '', event.type) +
    (event.cancelled ? '<div class="callout"><strong>Evento cancelado</strong><p>La convocatoria se conserva en el historial.</p></div>' : '') +
    '<div class="info-line"><span class="tile">' + icon('calendario') + '</span><div><strong>' + fullDate(event.starts) +
    '</strong><p class="muted">' + timeRange(event) + ' · Hora de Madrid · Fin aproximado</p></div></div>' +
    (places || event.meeting ? '<div class="info-line"><span class="tile">' + icon('map') + '</span><div><strong>' + esc(places || event.meeting) + '</strong>' +
      (event.meeting && places ? '<p class="muted">Punto de encuentro · ' + esc(event.meeting) + '</p>' : '') +
      '</div></div>' : '') +
    (event.description ? '<p class="event-description pre">' + esc(event.description) + '</p>' : '') +
    (map ? '<a class="button quiet event-action" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&amp;query=' +
      encodeURIComponent(map) + '">' + icon('map') + 'Abrir en mapas</a>' : '') +
    '</section><div class="stack event-side"><section class="card stack event-attendance"><div class="event-labels"><h2>' + icon('check') + 'Mi asistencia</h2>' +
    attendanceBadge(event.intention) + '</div>' +
    (pending ? '<div class="callout queue"><strong>' + (pending.error ? 'Cambio sin enviar' : 'Pendiente de envío') +
      '</strong><p>Tu selección local: ' + intention[pending.value] + '</p>' +
      (pending.error ? '<p>' + esc(pending.error) + '</p>' : '') +
      button('Retirar cambio local','secondary','id="discard"') + '</div>' : '') +
    (event.reason ? '<p class="muted pre">Motivo privado: ' + esc(event.reason) + '</p>' : '') +
    '<p class="event-description muted">' + icon('clock') + (open ? 'Puedes responder hasta el inicio del evento.' :
      'Las respuestas están cerradas para este evento.') + '</p>' +
    (open ? '<a class="button primary event-action" href="' + href + '/responder">Responder asistencia' + icon('arrow') + '</a>' : '') +
    '</section>' + (detail ? '<div class="row-list event-links">' +
    row('Asistentes',responses,href + '/asistentes','users') +
    (state.member.role === 'director' && !event.cancelled && !open ? row('Pasar lista','Registrar presencia real',href + '/pasar-lista','check') : '') +
    (state.member.role === 'director' ? row('Corregir intención','Revisar respuestas y motivos',href + '/corregir','perfil') : '') +
    (state.member.role === 'admin' ? row('Formación','Editar posiciones y plantillas',href + '/formacion','grid') : '') +
    '</div>' : '') + '</div>' + (detail ? '<section class="card stack event-documents"><h2>' + icon('file') + 'Información y documentos</h2>' +
    (detail.attachments.length ? '<div class="row-list">' + detail.attachments.map(file => row(file.name,'PDF','/api/files/' + file.id,'file')).join('') + '</div>' :
      '<p class="muted">Sin documentos adjuntos.</p>') +
    '<a class="button quiet event-action" href="/api/events/' + id + '/calendar">' + icon('calendario') + 'Exportar al calendario (.ics)</a>' +
    '<p class="muted">La exportación crea una copia. Consulta aquí los cambios posteriores.</p></section>' : '') + '</div></div>';
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
      '<p class="muted">Solo tú y el director podéis ver el motivo.</p></div>' + errorRegion +
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

function attendees(content, members, director) {
  const filters = [['all','Todos'],['yes','Asistirán'],['no','No asistirán'],['unset','Sin confirmar']];
  const totals = Map.groupBy(members, member => member.intention);
  let mode = 'all';
  content.insertAdjacentHTML('beforeend', '<div class="stack">' +
    segment('Filtrar asistentes',filters.map(([value,label]) => [value,label + ' · ' +
      (value === 'all' ? members.length : totals.get(value)?.length ?? 0)]),mode) +
    field('query','Buscar componente','type="search" autocomplete="off"') + '<div id="roster" class="row-list"></div>' +
    (director ? summary(members) : '') + '</div>');
  const search = content.querySelector('input');
  const groups = content.querySelector('.segments');
  const list = content.querySelector('#roster');
  function show() {
    const visible = members.filter(member => (member.intention === mode || mode === 'all') &&
      normalize(member.name + ' ' + member.instrument + ' ' + member.voice).includes(normalize(search.value)));
    list.innerHTML = visible.length ? visible.map(member => '<div class="row"><div class="row-copy"><strong>' +
      esc(member.name) + '</strong><span class="muted">' + instrument(member) + '</span></div>' +
      pill(otherIntention[member.intention],member.intention === 'yes' ? 'good' : '') + '</div>').join('') : empty('No hay componentes con esos filtros.');
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
  content.insertAdjacentHTML('beforeend','<form class="card stack"><p class="muted">La presencia se registra por separado de la intención.</p>' +
    '<div class="row-list">' + members.map(member => '<div class="row roll-row"><div><strong>' + esc(member.name) +
    '</strong><p class="muted">' + otherIntention[member.intention] + '</p>' +
    (member.reason ? '<p class="muted pre">Motivo privado: ' + esc(member.reason) + '</p>' : '') +
    '</div><label><span class="sr-only">Presencia de ' + esc(member.name) + '</span><select name="' + member.id +
    '">' + options(presence, member.presence) + '</select></label></div>').join('') +
    '</div>' + errorRegion + button('Guardar presencia') + '</form>');
  bindForm(content.querySelector('form'), async values => {
    const rows = members.filter(member => member.presence !== values[member.id])
      .map(member => ({ id:member.id, value:values[member.id] }));
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
