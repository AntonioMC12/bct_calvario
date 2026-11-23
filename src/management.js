import { area, back, bindForm, button, displayTime, empty, errorRegion, esc, field, header, instrument,
  link, normalize, options, otherIntention, pill, role, row, sectionTitle } from './ui.js';
import { localMinute } from './time.js';

const eventTypes = ['Ensayo','Actuación','Reunión','Procesión','Certamen','Concierto'];
const manager = state => !state.offline && ['admin','director'].includes(state.member.role);
const accessStatus = { active:'Activo',pending:'Pendiente',rejected:'Rechazado',inactive:'De baja' };
const eventRoute = id => '#/calendario/' + id;

export function pdfContent(file) {
  if (!file?.size || file.size > 5_242_880) throw new Error('Selecciona un PDF de hasta 5 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecciona un archivo PDF.');
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export async function management(content, ctx, mode) {
  if (!manager(ctx.state)) {
    content.innerHTML = header('Gestión') + empty('Tu perfil no dispone de herramientas de gestión con esta conexión.');
    return;
  }
  if (!mode) {
    content.innerHTML = header('Gestión',role[ctx.state.member.role]) + '<div class="row-list">' +
      row('Solicitudes','Revisar nuevas incorporaciones','#/gestion/solicitudes','users') +
      row('Miembros','Consultar contactos y estado de acceso','#/gestion/miembros','perfil') +
      row('Eventos','Crear, editar y cancelar convocatorias','#/calendario','calendario') +
      (ctx.state.member.role === 'admin' ? row('Formaciones','Abre un evento para editar su cuadrícula','#/calendario','grid') +
        row('Archivo musical','Crear obras y cargar partituras','#/repertorio','repertorio') :
        row('Validar partituras','Revisar PDF pendientes de distribución','#/repertorio','repertorio') +
        row('Publicar aviso','Enviar a la banda activa','#/gestion/aviso','avisos')) + '</div>';
    return;
  }
  if (!['solicitudes','miembros'].includes(mode)) {
    content.innerHTML = back('Gestión','#/gestion') + empty('Herramienta no encontrada.');
    return;
  }
  const isRequest = mode === 'solicitudes';
  const title = isRequest ? 'Solicitudes' : 'Miembros';
  content.innerHTML = back('Gestión','#/gestion') + header(title) + '<p role="status">Cargando…</p>';
  const { members } = await ctx.api('/management');
  const listed = isRequest ? members.filter(member => member.status === 'pending') : members.filter(member => member.status === 'active' || member.status === 'inactive');
  content.innerHTML = back('Gestión','#/gestion') + header(title,isRequest ? listed.length + ' pendientes de revisión' : 'Directorio interno') +
    (listed.length ? '<div class="stack">' + listed.map(member => '<article class="card member-card"><div><h2>' + esc(member.name) +
      '</h2><p class="muted">' + instrument(member) + '</p><p class="muted">' + esc(member.email) + '</p>' +
      (isRequest ? '<p class="muted">Solicitud · ' + displayTime(member.created_at) + '</p>' :
        pill(role[member.role]) + ' ' + pill(accessStatus[member.status])) + '</div>' +
      (isRequest ? '<form data-id="' + member.id + '" class="stack"><div class="actions">' +
        button('Rechazar','secondary','data-choice="rejected"') + button('Aprobar','primary','data-choice="active"') +
        '</div>' + errorRegion + '</form>' : '') + '</article>').join('') + '</div>' :
    empty(isRequest ? 'No hay solicitudes pendientes.' : 'No hay componentes en el directorio.'));
  for (const form of content.querySelectorAll('form')) {
    form.addEventListener('submit', event => {
      form.dataset.choice = event.submitter?.dataset.choice;
    });
    bindForm(form, async () => {
      const status = form.dataset.choice;
      if (!status) return;
      const member = listed.find(item => item.id === form.dataset.id);
      const label = status === 'active' ? 'Aprobar' : 'Rechazar';
      if (!await ctx.confirmAction(label + ' solicitud', member.name + ' · ' + member.email, label)) return;
      await ctx.api('/requests/' + member.id,'PUT',{ status });
      ctx.toast(status === 'active' ? 'Solicitud aprobada' : 'Solicitud rechazada');
      await management(content,ctx,mode);
    });
  }
}

export async function eventEditor(content, ctx, id) {
  if (!manager(ctx.state)) {
    content.innerHTML = back('Calendario','#/calendario') + empty('Solo administración y dirección pueden gestionar eventos en línea.');
    return;
  }
  const creating = id === 'nuevo';
  const href = creating ? '#/calendario' : eventRoute(id);
  const previous = back(creating ? 'Calendario' : 'Evento',href);
  let detail;
  if (!creating) {
    content.innerHTML = previous + header('Editar evento') + '<p role="status">Cargando…</p>';
    detail = await ctx.api('/events/' + id);
    if (detail.event.cancelled) {
      content.innerHTML = previous + empty('El evento está cancelado.');
      return;
    }
  }
  const event = detail?.event ?? {};
  content.innerHTML = previous + header(creating ? 'Nuevo evento' : 'Editar evento','Los horarios se guardan en la hora de Madrid.') +
    '<div class="event-layout"><form class="card stack" id="event-form">' +
    field('title','Título','required maxlength="120"',event.title) +
    '<label>Tipo<select name="type">' + options(Object.fromEntries(eventTypes.map(type => [type,type])),event.type) + '</select></label>' +
    '<div class="field-grid">' +
    field('starts','Inicio','required type="datetime-local"',event.starts && localMinute(event.starts)) +
    field('ends','Fin aproximado','required type="datetime-local"',event.ends && localMinute(event.ends)) + '</div>' +
    '<div class="field-grid">' + field('location','Lugar','maxlength="200"',event.location) +
    field('town','Localidad','maxlength="120"',event.town) + '</div>' +
    field('meeting','Punto de encuentro','maxlength="200"',event.meeting) +
    area('description','Descripción','maxlength="3000"',event.description) +
    '<label class="choice"><input type="checkbox" name="reminder"' + (event.reminder_minutes != null ? ' checked' : '') +
    '><span>Enviar recordatorio en Avisos</span></label>' +
    '<div id="reminder-minutes">' + field('minutes','Minutos de antelación','type="number" min="1" max="10080" required',event.reminder_minutes ?? 120) +
    '</div>' + errorRegion + button('Guardar evento') + '</form><div class="stack">' +
    (creating ? '<section class="card"><h2>Documentos</h2><p class="muted">Guarda el evento para adjuntar documentos en PDF.</p></section>' :
      '<section class="card stack"><h2>Documentos</h2>' +
      (detail.attachments.length ? '<div class="row-list">' + detail.attachments.map(file =>
        row(file.name,'PDF','/api/files/' + file.id,'file')).join('') + '</div>' : '') +
      '<form id="attachment" class="stack"><label>Adjuntar PDF<input required type="file" name="file" accept="application/pdf,.pdf"></label>' +
      errorRegion + button('Subir documento','secondary') + '</form></section>' +
      '<section class="card stack"><h2>Cancelar convocatoria</h2><p class="muted">El evento seguirá en el calendario y se publicará un aviso.</p>' +
      '<form id="cancel">' + errorRegion + button('Cancelar evento','secondary') + '</form></section>') + '</div></div>';
  const form = content.querySelector('#event-form');
  const toggleReminder = () => {
    const enabled = form.elements.reminder.checked;
    form.querySelector('#reminder-minutes').hidden = !enabled;
    form.elements.minutes.disabled = !enabled;
  };
  form.elements.reminder.onchange = toggleReminder;
  toggleReminder();
  bindForm(form, async input => {
    const saved = await ctx.api(creating ? '/events' : '/events/' + id,creating ? 'POST' : 'PUT',{
      ...input, version:event.version, reminder_minutes:input.reminder ? Number(input.minutes) : null,
    });
    await ctx.refresh();
    ctx.toast('Evento guardado');
    ctx.go(eventRoute(saved.id));
  });
  const attachment = content.querySelector('#attachment');
  if (attachment) bindForm(attachment, async input => {
    await ctx.api('/events/' + id + '/attachments','POST',{ name:input.file.name, content:await pdfContent(input.file) },30000);
    ctx.toast('Documento adjuntado');
    await eventEditor(content,ctx,id);
  });
  const cancel = content.querySelector('#cancel');
  if (cancel) bindForm(cancel, async () => {
    if (!await ctx.confirmAction('¿Cancelar el evento?',event.title + ' · ' + displayTime(event.starts),'Cancelar evento')) return;
    await ctx.api('/events/' + id + '/cancel','POST',{ version:event.version });
    await ctx.refresh();
    ctx.toast('Evento cancelado');
    ctx.go(href);
  });
}

export function composeNotice(content, ctx) {
  content.innerHTML = back('Avisos','#/avisos') + header('Nuevo aviso','Destinatarios · Banda activa') +
    (ctx.state.member.role === 'director' && !ctx.state.offline ?
      '<form class="card stack">' + field('title','Asunto','required maxlength="120"') +
      area('message','Mensaje','required maxlength="4000" rows="6"') + errorRegion + button('Revisar aviso') + '</form>' :
      empty('Solo dirección puede publicar avisos con conexión.'));
  const form = content.querySelector('form');
  if (form) bindForm(form, async input => {
    if (!await ctx.confirmAction(input.title,input.message,'Publicar aviso')) return;
    const result = await ctx.api('/notices','POST',input);
    await ctx.refresh();
    ctx.toast('Aviso publicado');
    ctx.go('#/avisos/' + result.id);
  });
}

export async function formationEditor(content, ctx, id) {
  const href = eventRoute(id);
  const previous = back('Evento',href);
  if (ctx.state.member.role !== 'admin' || ctx.state.offline) {
    content.innerHTML = previous + empty('Solo administración puede editar formaciones con conexión.');
    return;
  }
  const event = ctx.state.data.events.find(item => item.id === id);
  if (!event) {
    content.innerHTML = previous + empty('Evento no encontrado.');
    return;
  }
  content.innerHTML = previous + header('Formación',event.title) + '<p role="status">Cargando…</p>';
  const data = await ctx.api('/events/' + id + '/formation');
  const people = new Map(data.members.map(member => [member.id,member]));
  let columns = data.columns;
  let positions = [...data.positions];
  let selected = 0;
  let version = data.version;
  let baseline = [...data.positions];
  let baselineColumns = data.columns;

  function draw(focusSlot = false) {
    const assigned = people.get(positions[selected]);
    const active = data.members.filter(member => member.status === 'active');
    const coordinate = pos => (Math.floor(pos / columns) + 1) + '.' + (pos % columns + 1);
    const sources = Object.fromEntries(data.sources.map(item => [item.id,item.title + ' · ' + displayTime(item.starts)]));
    const templates = Object.fromEntries(data.templates.map(item => [item.id,item.name + ' · ' + item.columns + ' columnas']));
    content.innerHTML = previous + header('Formación',event.title) + '<div class="formation-layout"><section class="card stack">' +
      '<form id="reshape" class="stack"><div class="field-grid">' +
      field('columns','Columnas','required type="number" min="1" max="12"',columns) +
      field('rows','Filas','required type="number" min="1" max="240"',positions.length / columns) +
      '</div>' + errorRegion + button('Cambiar cuadrícula','secondary') + '</form><p class="eyebrow align-center">Frente de la banda ↑</p>' +
      '<div class="formation-scroll"><table class="formation-grid"><tbody>' +
      Array.from({length:positions.length / columns},(_,r) => '<tr>' + positions.slice(r * columns,(r + 1) * columns).map((person,c) => {
        const pos = r * columns + c;
        return '<td><button type="button" data-position="' + pos + '" aria-pressed="' + (pos === selected) + '">' +
          '<span>' + coordinate(pos) + '</span><strong>' + esc(people.get(person)?.name ?? 'Vacío') + '</strong></button></td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div><form class="stack" id="save-formation">' + errorRegion +
      button('Guardar formación') + '</form></section><div class="stack"><section class="card stack">' +
      '<h2>Posición ' + coordinate(selected) + '</h2>' + (assigned ? '<p><strong>' + esc(assigned.name) +
        '</strong><br><span class="muted">' + instrument(assigned) + ' · ' + otherIntention[assigned.intention] + '</span></p>' :
        '<p class="muted">Sin asignar</p>') +
      '<form id="assign" class="stack">' + field('query','Buscar componente','type="search"') +
      '<div class="stack"><label for="formation-person">Componente</label><select id="formation-person" name="person" size="5" required></select></div>' + errorRegion +
      '<div class="actions">' + button('Asignar o mover','primary') + button('Vaciar','secondary','type="button" id="clear-slot"') +
      '</div></form></section><section class="card stack"><h2>Copias y plantillas</h2>' +
      (Object.keys(sources).length ? '<form id="copy" class="stack"><label>Evento de origen<select name="source">' +
        options(sources) + '</select></label>' + errorRegion + button('Copiar formación','secondary') + '</form>' : '') +
      (Object.keys(templates).length ? '<form id="template" class="stack"><label>Plantilla<select name="source">' +
        options(templates) + '</select></label>' + errorRegion + button('Aplicar plantilla','secondary') + '</form>' : '') +
      '<form id="save-template" class="stack">' + field('name','Nombre de nueva plantilla','required maxlength="100"') +
      '<p class="muted">La plantilla guarda la cuadrícula sin componentes.</p>' + errorRegion +
      button('Guardar plantilla','secondary') + '</form></section></div></div>';
    const filtered = content.querySelector('#assign');
    function filterPeople() {
      filtered.elements.person.innerHTML = options(Object.fromEntries(active.filter(member => normalize(
        [member.name,member.instrument,member.voice].join(' ')).includes(normalize(filtered.elements.query.value)))
        .map(member => [member.id,member.name + ' · ' + otherIntention[member.intention]])),positions[selected]);
    }
    filtered.elements.query.oninput = filterPeople;
    filterPeople();
    for (const control of content.querySelectorAll('[data-position]')) {
      control.onclick = () => { selected = Number(control.dataset.position); draw(true); };
    }
    if (focusSlot) content.querySelector('[aria-pressed="true"]')?.focus();
    bindForm(filtered, async input => {
      const source = positions.indexOf(input.person);
      const occupant = positions[selected];
      if (source === selected) return;
      if (occupant && source < 0 && !await ctx.confirmAction('¿Sustituir componente?',people.get(occupant).name + ' dejará esta posición.','Sustituir')) return;
      if (source >= 0) positions[source] = occupant;
      positions[selected] = input.person;
      draw(true);
    });
    content.querySelector('#clear-slot').onclick = () => { positions[selected] = null; draw(true); };
    bindForm(content.querySelector('#reshape'), async input => {
      const nextColumns = Number(input.columns);
      const nextRows = Number(input.rows);
      if (nextRows * nextColumns > 240) throw new Error('El máximo son 240 posiciones.');
      const next = Array(nextColumns * nextRows).fill(null);
      const removed = [];
      positions.forEach((person,pos) => {
        const row = Math.floor(pos / columns);
        const col = pos % columns;
        if (row < nextRows && col < nextColumns) next[row * nextColumns + col] = person;
        else if (person) removed.push(people.get(person).name);
      });
      if (removed.length && !await ctx.confirmAction('¿Reducir la cuadrícula?',removed.join(', ') + ' perderán su posición.','Cambiar cuadrícula')) return;
      columns = nextColumns;
      positions = next;
      selected = 0;
      draw();
    });
    bindForm(content.querySelector('#save-formation'), async () => {
      const removed = baseline.filter(person => person && !positions.includes(person));
      if (removed.length && !await ctx.confirmAction('¿Guardar estos cambios?',
        'Se retirará de la formación a ' + removed.map(id => people.get(id)?.name).join(', ') + '.', 'Guardar')) return;
      const result = await ctx.api('/events/' + id + '/formation','PUT',{ columns, positions, version, confirmRemoval:removed.length > 0 });
      version = result.version;
      baseline = [...result.positions];
      baselineColumns = result.columns;
      ctx.toast('Formación guardada');
      draw();
    });
    const copying = content.querySelector('#copy');
    if (copying) bindForm(copying, async input => {
      const source = await ctx.api('/events/' + input.source + '/formation');
      const removed = source.positions.filter(person => person && people.get(person)?.status !== 'active').length;
      if (!await ctx.confirmAction('¿Copiar formación?', 'La copia reemplaza la cuadrícula actual al guardar.' +
        (removed ? ' Se omitirán ' + removed + ' componentes de baja.' : ''),'Copiar')) return;
      columns = source.columns;
      positions = source.positions.map(person => people.get(person)?.status === 'active' ? person : null);
      selected = 0;
      draw();
    });
    const applying = content.querySelector('#template');
    if (applying) bindForm(applying, async input => {
      if (!await ctx.confirmAction('¿Aplicar plantilla?','La plantilla sustituirá la cuadrícula actual por posiciones vacías.','Aplicar')) return;
      const template = data.templates.find(item => item.id === input.source);
      columns = template.columns;
      positions = Array(template.size).fill(null);
      selected = 0;
      draw();
    });
    bindForm(content.querySelector('#save-template'), async input => {
      if (!version || positions.length !== baseline.length || columns !== baselineColumns ||
        positions.some((person,pos) => person !== baseline[pos])) throw new Error('Guarda primero la cuadrícula que quieres reutilizar.');
      await ctx.api('/events/' + id + '/template','POST',input);
      ctx.toast('Plantilla guardada');
      await formationEditor(content,ctx,id);
    });
  }
  draw();
}
