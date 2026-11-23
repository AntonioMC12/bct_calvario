import { localMinute, zone } from './time.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const paths = {
  inicio: '<path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h.01m4 0h.01m4 0h.01m-8 3h.01m4 0h.01"/>',
  repertorio: '<path d="M9 17V5l11-2v12M9 9l11-2"/><ellipse cx="6" cy="17.5" rx="3" ry="2.5"/><ellipse cx="17" cy="15.5" rx="3" ry="2.5"/>',
  avisos: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  perfil: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
  gestion: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V4h8v3M3 13h18m-11 0v2h4v-2"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  map: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-15a3 3 0 0 1 0 6m2 4a4 4 0 0 1 3 4v1"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  exit: '<path d="M11 4H5v16h6m-1-8h11m-4-4 4 4-4 4"/>',
};

export const icon = name => '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';

export const intention = { yes: 'Asistiré', no: 'No asistiré', unset: 'Sin confirmar' };
export const otherIntention = { yes: 'Asistirá', no: 'No asistirá', unset: 'Sin confirmar' };
export const presence = { present: 'Presente', absent: 'No presente', unset: 'Sin registrar' };
export const role = { musician: 'Músico', admin: 'Administrador', director: 'Director' };
export const instrument = member => [member.instrument, member.voice].filter(Boolean).map(esc).join(' · ');
export const matchesScore = (file, member) => file.approved && normalize(file.instrument) === normalize(member.instrument) &&
  normalize(file.voice) === normalize(member.voice);
export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export const initials = name => name.trim().split(/\s+/).slice(0,2).map(word => esc(word[0]?.toUpperCase())).join('');

const fmt = options => new Intl.DateTimeFormat('es-ES', { ...options, timeZone: zone });
const full = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const dateAndTime = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const time = fmt({ hour: '2-digit', minute: '2-digit' });
const month = fmt({ month: 'short' });
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

export const fullDate = date => capitalize(full.format(new Date(date)));
export const displayTime = date => dateAndTime.format(new Date(date));
export const dayKey = date => localMinute(date).slice(0,10);
export const dateOnly = date => fullDate(date + 'T12:00:00Z');
export const timeRange = event => {
  const start = time.format(new Date(event.starts));
  const end = time.format(new Date(event.ends));
  return start + ' – ' + (dayKey(event.starts) === dayKey(event.ends) ? end : fullDate(event.ends) + ' · ' + end);
};

export function header(title, subtitle = '', action = '', eyebrow = '') {
  return '<header class="page-head"><div>' + (eyebrow ? '<p class="eyebrow">' + esc(eyebrow) + '</p>' : '') +
    '<h1 tabindex="-1">' + esc(title) + '</h1>' + (subtitle ? '<p class="muted">' + esc(subtitle) + '</p>' : '') +
    '</div>' + action + '</header>';
}
export const sectionTitle = (title, action = '') => '<div class="section-head"><h2>' + esc(title) + '</h2>' + action + '</div>';
export const link = (label, href) => '<a class="text-link" href="' + esc(href) + '">' + esc(label) + '</a>';
export const back = (label, href) => '<a class="back" href="' + esc(href) + '">' + icon('left') + esc(label) + '</a>';
export const empty = message => '<p class="card empty muted">' + esc(message) + '</p>';
export const pill = (label, tone = '') => '<span class="pill ' + tone + '">' + esc(label) + '</span>';
export const errorRegion = '<p class="form-error" role="alert" hidden></p>';
export const button = (label, tone = 'primary', attr = '') => '<button class="button ' + tone + '" ' + attr + '>' + esc(label) + '</button>';
export const row = (label, sub, href, glyph) => '<a class="row" href="' + esc(href) + '">' +
  (glyph ? '<span class="tile">' + icon(glyph) + '</span>' : '') + '<span class="row-copy"><strong>' + esc(label) +
  '</strong>' + (sub ? '<span class="muted">' + esc(sub) + '</span>' : '') + '</span>' + icon('right') + '</a>';
export const field = (name, label, attributes = '', value = '') => '<label>' + esc(label) +
  '<input name="' + name + '" ' + attributes + ' value="' + esc(value) + '"></label>';
export const area = (name, label, attributes = '', value = '') => '<label>' + esc(label) +
  '<textarea name="' + name + '" ' + attributes + '>' + esc(value) + '</textarea></label>';
export const options = (items, current) => Object.entries(items).map(([value,label]) =>
  '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
export const segment = (name, entries, current) => '<div class="segments" role="group" aria-label="' + esc(name) + '">' +
  entries.map(([value, label]) => '<button type="button" data-value="' + esc(value) + '" aria-pressed="' +
    (value === current) + '">' + esc(label) + '</button>').join('') + '</div>';

export function bindForm(form, submit) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy) return;
    const trigger = event.submitter;
    const feedback = form.querySelector('.form-error');
    if (feedback) feedback.hidden = true;
    form.dataset.busy = 'true';
    if (trigger) trigger.disabled = true;
    try {
      await submit(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      if (feedback) {
        feedback.textContent = error.message;
        feedback.hidden = false;
      }
    } finally {
      delete form.dataset.busy;
      if (trigger) trigger.disabled = false;
    }
  });
}

export function eventCard(event, pending) {
  const date = new Date(event.starts);
  const status = event.cancelled ? 'Evento cancelado' : intention[event.intention];
  const day = dayKey(date).slice(8);
  return '<article class="card event-card"><div class="event-summary"><div class="date-chip" aria-hidden="true">' +
    '<span>' + month.format(date).replace('.', '') + '</span><strong>' + day + '</strong></div><div><p class="eyebrow">' +
    esc(event.type) + '</p><h3>' + esc(event.title) + '</h3><p class="muted">' + fullDate(date) + ' · ' + timeRange(event) +
    '</p><p class="muted">' + esc([event.location,event.town].filter(Boolean).join(' · ')) + '</p></div></div>' +
    '<div class="event-footer"><span class="status">' + icon(event.intention === 'yes' && !event.cancelled ? 'check' : 'clock') +
    esc(status) + (pending ? ' · Pendiente de envío' : '') + '</span>' + link('Ver evento', '#/calendario/' + event.id) + '</div></article>';
}
