import { localMinute, zone } from './time.js';
import { samePart } from './parts.js';
export { normalize } from './parts.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const paths = {
  inicio: '<path d="m4 10 8-7 8 7v10a1 1 0 0 1-1 1h-4v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H5a1 1 0 0 1-1-1z"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h.01m4 0h.01m4 0h.01m-8 3h.01m4 0h.01m4 0h.01"/>',
  repertorio: '<path d="M11 17V4h6v3h-6"/><circle cx="8" cy="17" r="3" fill="currentColor"/>',
  avisos: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  perfil: '<circle cx="12" cy="7" r="3.4"/><path d="M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1z"/>',
  gestion: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V4h8v3M3 13h18m-11 0v2h4v-2"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  pencil: '<path d="m4 16 12-12a2.8 2.8 0 0 1 4 4L8 20l-5 1zM14 6l4 4"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  chart: '<path d="M4 4v16h16M9 16v-4m5 4V8m5 8V5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  eye: '<path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  'eye-off': '<path d="m3 3 18 18M10.5 6.1c.5-.1 1-.1 1.5-.1 7 0 10 6 10 6a14 14 0 0 1-2.8 3.1M6.1 8.2A15 15 0 0 0 2 12s3 6 10 6a12 12 0 0 0 4-.7M10 10a2.8 2.8 0 0 0 4 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  shield: '<path d="m12 3 8 3v5c0 5-3.2 8.8-8 11-4.8-2.2-8-6-8-11V6z"/><path d="m9 12 2 2 4-4"/>',
  login: '<path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M3 12h12m-4-4 4 4-4 4"/>',
  inbox: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  announce: '<path d="M3 9h5l8-4v14l-8-4H3zM7 15l1.8 5H11m8-12 2-2m-2 6h3m-3 4 2 2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  box: '<path d="M3 7h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 7l2-4h14l2 4m-12 5h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18"/>',
  compass: '<path d="m3 11 18-8-8 18-2-8z"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1" fill="var(--surface, transparent)"/><path d="m9 14 2 2 4-5"/>',
  'check-ring': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  'cross-ring': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
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

export const icon = name => '<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';

export const intention = { yes: 'Asistiré', no: 'No asistiré', unset: 'Sin confirmar' };
export const otherIntention = { yes: 'Asistirá', no: 'No asistirá', unset: 'Sin confirmar' };
export const presence = { present: 'Presente', absent: 'No presente', unset: 'Sin registrar' };
export const role = { musician: 'Músico', director: 'Dirección' };
export const instrument = member => [member.instrument, member.voice].filter(Boolean).map(esc).join(' · ');
export const matchesScore = (file, member) => file.approved && !file.archived && samePart(file,member);
export const initials = name => name.trim().split(/\s+/).slice(0,2).map(word => esc(word[0]?.toUpperCase())).join('');

const fmt = options => new Intl.DateTimeFormat('es-ES', { ...options, timeZone: zone });
const full = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const dateAndTime = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const time = fmt({ hour: '2-digit', minute: '2-digit' });
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

export const fullDate = date => capitalize(full.format(new Date(date)));
export const displayTime = date => dateAndTime.format(new Date(date));
export const displayHour = date => time.format(new Date(date));
export const dayKey = date => localMinute(date).slice(0,10);
export const dateOnly = date => fullDate(date + 'T12:00:00Z');
export const timeRange = event => {
  const start = displayHour(event.starts);
  const end = displayHour(event.ends);
  return start + ' – ' + (dayKey(event.starts) === dayKey(event.ends) ? end : fullDate(event.ends) + ' · ' + end);
};

export function header(title, subtitle = '', action = '', eyebrow = '') {
  return '<header class="page-head"><div>' + (eyebrow ? '<p class="eyebrow">' + esc(eyebrow) + '</p>' : '') +
    '<h1 tabindex="-1">' + esc(title) + '</h1>' + (subtitle ? '<p class="muted">' + esc(subtitle) + '</p>' : '') +
    '</div>' + action + '</header>';
}
export const sectionTitle = (title, action = '', glyph = '', count = '') => '<div class="section-head"><h2>' +
  (glyph ? icon(glyph) : '') + '<span>' + esc(title) + '</span>' + count + '</h2>' + action + '</div>';
export const link = (label, href) => '<a class="text-link" href="' + esc(href) + '">' + esc(label) + '</a>';
export const actionLink = (label, href, glyph = 'right') => '<a class="button secondary section-action" href="' +
  esc(href) + '"><span>' + esc(label) + '</span>' + icon(glyph) + '</a>';
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
  entries.map(([value, label, glyph]) => '<button type="button" data-value="' + esc(value) + '" aria-pressed="' +
    (value === current) + '">' + (glyph ? icon(glyph) : '') + esc(label) + '</button>').join('') + '</div>';

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
      await submit(Object.fromEntries(new FormData(form)), form, trigger);
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

export function attendanceBadge(value) {
  const tone = { yes: 'good', no: 'accent', unset: 'waiting' };
  return pill(intention[value], tone[value] + ' status-dot');
}

export function eventCard(event, pending, { featured = false, quick = false } = {}) {
  const location = [event.location,event.town].filter(Boolean).join(' · ');
  const selected = pending && !pending.error ? pending.value : event.intention;
  const status = event.cancelled ? pill('Evento cancelado', 'accent') : attendanceBadge(selected);
  const options = [['yes','check-ring'],['no','cross-ring']];
  return '<article class="card event-card' + (featured ? ' event-featured' : '') + '"><div class="event-labels">' +
    pill(event.type,'event-kind' + (!featured ? event.type === 'Ensayo' ? ' waiting' : ' accent' : '')) + status + '</div>' +
    '<h3>' + esc(event.title) + '</h3>' +
    (featured && event.description ? '<p class="muted excerpt">' + esc(event.description) + '</p>' : '') +
    '<div class="event-meta">' +
    '<p>' + icon('clock') + '<span>' + fullDate(event.starts) + ' · ' + timeRange(event) + '</span></p>' +
    (location ? '<p>' + icon('map') + '<span>' + esc(location) + '</span></p>' : '') + '</div>' +
    (pending ? '<p class="muted">' + (pending.error ? 'Cambio sin enviar' : 'Pendiente de envío') + '</p>' : '') +
    (quick ? '<form class="quick-attendance" data-rehearsal="' + esc(event.id) + '" aria-label="Asistencia a ' + esc(event.title) + '">' +
      options.map(([value,glyph]) => '<button type="submit" class="button ' +
        (selected === value || selected === 'unset' && value === 'yes' ? 'primary' : 'quiet') +
        '" value="' + value + '" aria-pressed="' + (selected === value) + '">' + icon(glyph) + intention[value] + '</button>').join('') +
      errorRegion + '</form>' : '') +
    '<a class="button ' + (featured && !quick ? 'primary' : 'quiet') + ' event-action" href="#/calendario/' + esc(event.id) +
    '">Ver convocatoria' + icon(featured ? 'arrow' : 'right') + '</a></article>';
}
