import { back, bindForm, button, displayTime, empty, errorRegion, esc, eventCard, field, fullDate, header, icon,
  initials, instrument, intention, link, matchesScore, options, pill, presence, role, row, sectionTitle, segment } from './ui.js';
import { cacheDashboard, clearLocalSignout, clearPrivate, getLocal, localSignoutPending, markLocalSignout, savePending, savedFiles } from './storage.js';
import { calendar, eventPage } from './events.js';
import { repertoire, downloads } from './repertoire.js';
import { attendanceReportPage } from './report.js';
import { management, managementTools, eventEditor, formationEditor, composeNotice } from './management.js';
import { materialPage } from './material.js';
import { catalogPage } from './part-options.js';
import { access, mailRoutes } from './access.js';
import { bindGoogle, googleButton } from './google.js';
import { clearPush, pushSettings } from './push.js';
import { backend, captureSession, clearSession, hosted, openPrivateLink, suspendSession } from './connection.js';
import { canManage } from './roles.js';

const shell = document.querySelector('#shell');
const dialog = document.querySelector('#dialog');
const status = document.querySelector('#feedback');
const destinations = [['inicio','Inicio'], ['calendario','Calendario'], ['repertorio','Repertorio'], ['avisos','Avisos'], ['perfil','Perfil']];
const state = { member:null, data:null, pending:{}, saved:new Set(), offline:false, cacheReady:false,
  mailEnabled:!hosted, pilotUnavailable:hosted };
let rendering = 0;
let lastPage;
let toastTimer;

export async function api(path, method = 'GET', data, timeout = 12000) {
  let response;
  const headers = {};
  if (state.member?.id && path !== '/login' && path !== '/request-access' && path !== '/logout' && path !== '/session') {
    headers['X-Calvario-Account'] = state.member.id;
  }
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  try {
    response = await backend(path,{
      method, headers, cache: 'no-store', signal: AbortSignal.timeout(timeout),
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch {
    const error = new Error('No se puede conectar con Calvario. Comprueba tu conexión.');
    error.network = true;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la operación.');
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  captureSession(path,payload);
  return payload;
}

function go(href) {
  if (location.hash === href) render();
  else location.hash = href;
}

function toast(message) {
  clearTimeout(toastTimer);
  status.textContent = message;
  status.classList.toggle('visible', Boolean(message));
  toastTimer = setTimeout(() => status.classList.remove('visible'), 4500);
}

async function reset(member = null) {
  state.member = member;
  state.data = null;
  state.pending = {};
  state.saved = new Set();
  state.noticeDraft = null;
  state.cacheReady = false;
  await clearPrivate();
  await clearPush().catch(() => {});
}

function networkFailure(error) {
  if (error.status === 401 || error.code === 'inactive' || error.code === 'account_changed') {
    clearSession();
    reset().then(render);
    toast(error.message);
  } else if (error.network) {
    state.offline = true;
    updateConnectionBanner();
  }
}

async function refresh() {
  const data = await api('/dashboard');
  const local = getLocal();
  if (local.account && local.account !== data.member.id) await reset();
  state.member = data.member;
  state.data = data;
  state.catalogValues = data.catalogValues;
  state.offline = false;
  state.cacheReady = false;
  try {
    cacheDashboard(data);
    state.cacheReady = true;
  } catch (error) {
    toast(error.message);
  }
  state.pending = local.account === data.member.id ? local.pending : {};
  state.saved = await savedFiles(data.member.id,data.works).catch(() => new Set());
}

let booting;
function bootstrap() {
  booting ??= restore().finally(() => { booting = undefined; });
  return booting;
}

async function restore() {
  let local;
  try {
    if (localSignoutPending()) {
      await api('/logout', 'POST', {});
      clearLocalSignout();
    }
    const { member, google, pushEnabled, mailEnabled, catalogValues } = await api('/session');
    Object.assign(state,{ google,pushEnabled,mailEnabled,catalogValues,pilotUnavailable:false });
    state.offline = false;
    local = getLocal();
    if (!member) clearSession();
    if (!member || member.status !== 'active' || (local.account && local.account !== member.id)) await reset(member);
    state.member = member;
    if (member?.status === 'active') {
      await refresh();
      await sync();
    }
  } catch (error) {
    if (error.network) {
      local = getLocal();
      state.offline = true;
      state.data = local.dashboard;
      state.member = local.dashboard?.member ?? null;
      state.pending = local.pending;
      state.cacheReady = Boolean(local.dashboard);
      state.saved = await savedFiles(state.member?.id,local.dashboard?.works).catch(() => new Set());
    } else {
      networkFailure(error);
      toast(error.message);
    }
  }
  await render();
}

function setPending(eventId, update) {
  const pending = { ...getLocal().pending };
  if (update) pending[eventId] = update;
  else delete pending[eventId];
  savePending(state.member.id, pending);
  state.pending = pending;
  updateConnectionBanner();
}

let syncing;
async function sync() {
  if (syncing) return syncing;
  const id = state.member?.id;
  if (!id || state.offline || getLocal().account !== id) return;
  syncing = (async () => {
    const entries = Object.entries(getLocal().pending).filter(([, change]) => !change.error);
    let submitted = false;
    for (const [eventId, change] of entries) {
      if (getLocal().account !== id) return;
      try {
        await api('/events/' + eventId + '/intention', 'PUT', change);
        if (getLocal().account === id && state.member?.id === id && getLocal().pending[eventId]?.key === change.key) {
          setPending(eventId, null);
        }
        submitted = true;
      } catch (error) {
        if ((error.status === 409 && error.code !== 'account_changed') || error.status === 404) {
          if (getLocal().account === id && state.member?.id === id && getLocal().pending[eventId]?.key === change.key) {
            setPending(eventId, { ...change, error: error.message });
          }
          submitted = true;
        } else {
          networkFailure(error);
          break;
        }
      }
    }
    if (submitted && state.member?.id === id) await refresh();
  })();
  try { await syncing; } finally { syncing = undefined; }
}

async function respond(event, value, reason) {
  const update = { value, reason, version: event.intention_version, key: crypto.randomUUID() };
  if (!state.offline) {
    try {
      const receipt = await api('/events/' + event.id + '/intention', 'PUT', update);
      if (state.pending[event.id]) setPending(event.id, null);
      try {
        await refresh();
      } catch (error) {
        networkFailure(error);
        const saved = state.data?.events.find(item => item.id === event.id);
        if (saved) Object.assign(saved, { intention: receipt.value, reason: receipt.reason, intention_version: receipt.version });
      }
      toast('Respuesta recibida');
      return;
    } catch (error) {
      if (!error.network) {
        networkFailure(error);
        throw error;
      }
      state.offline = true;
    }
  }
  if (!state.cacheReady || syncing || getLocal().account !== state.member.id) {
    throw new Error('Abre la aplicación con conexión para poder guardar respuestas en este dispositivo.');
  }
  setPending(event.id, update);
  toast('Guardado en este dispositivo. Pendiente de envío.');
}

async function logout() {
  const count = Object.keys(getLocal().pending).length;
  if (count && !await confirmAction('¿Cerrar sesión?', 'Hay ' + count + ' cambios sin enviar. Se retirarán al cerrar sesión.', 'Cerrar sesión')) return;
  try {
    if (state.offline) markLocalSignout();
    else await api('/logout', 'POST', {});
  } catch (error) {
    if (!error.network) throw error;
    markLocalSignout();
  }
  suspendSession();
  await reset();
  toast('');
  go('#/inicio');
  render();
}

function confirmAction(title, message, action) {
  dialog.innerHTML = '<form method="dialog"><h2 id="dialog-title">' + esc(title) + '</h2><p class="muted">' +
    esc(message) + '</p><div class="actions">' + button('Volver','secondary','value="no" autofocus') +
    button(action,'primary','value="yes"') + '</div></form>';
  return new Promise(resolve => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once:true });
    dialog.showModal();
  });
}

async function signIn(requesting, input) {
  if (localSignoutPending()) {
    await api('/logout', 'POST', {});
    clearLocalSignout();
  }
  await api(requesting ? '/request-access' : '/login', 'POST', input);
}

function home(data) {
  const upcoming = data.events.filter(event => !event.cancelled && Date.parse(event.starts) > Date.now());
  const [next] = upcoming;
  const rehearsal = upcoming.find(event => event.type === 'Ensayo');
  const unread = data.notices.filter(item => !item.read_at);
  const memberPart = instrument(data.member);
  const personal = data.works.flatMap(work => work.scores.filter(file => matchesScore(file, data.member))
    .map(file => ({ work, file }))).slice(0,3);
  return '<div class="home-view"><div class="home-intro"><p class="brand home-wordmark">Calvario</p>' +
    header('Tu banda, al día', '', '', fullDate(new Date())) + '</div>' +
    '<div class="home-grid"><section>' + sectionTitle('Próximo evento', link('Ver calendario','#/calendario'), 'calendario') +
    (next ? eventCard(next, state.pending[next.id], { featured:true, quick:next === rehearsal }) : empty('No hay próximas convocatorias.')) +
    (rehearsal && rehearsal !== next ? '<div class="home-rehearsal">' + sectionTitle('Próximo ensayo') +
      eventCard(rehearsal,state.pending[rehearsal.id],{ featured:true, quick:true }) + '</div>' : '') +
    '</section><div class="home-sections">' +
    (unread.length ? '<section class="home-notices">' + sectionTitle('Avisos', link('Ver todos','#/avisos'), 'announce',
      pill(unread.length + (unread.length === 1 ? ' nuevo' : ' nuevos'), 'accent')) +
      '<div class="row-list">' + unread.slice(0,2).map(notice =>
        '<a class="row home-notice" href="#/avisos/' + esc(notice.id) + '"><span class="tile">' + icon('bell') + '</span>' +
        '<span class="row-copy"><span class="home-notice-date muted">' + displayTime(notice.created_at) + '</span><strong>' +
        esc(notice.title) + '</strong><span class="muted excerpt">' + esc(notice.message) + '</span></span>' + icon('right') + '</a>').join('') +
      '</div></section>' : '') +
    '<section>' + sectionTitle('Para tu instrumento', link('Repertorio','#/repertorio'), 'repertorio') +
    (memberPart ? '<p class="home-section-note muted">Tu parte · ' + memberPart + '</p>' : '') +
    (personal.length ? '<div class="home-scores">' + personal.map(({ work, file }) =>
      row(work.title, [work.authors,state.saved.has(file.id) ? 'Guardada sin conexión' : 'PDF'].filter(Boolean).join(' · '),
        '#/repertorio/' + work.id, 'file')).join('') +
    '</div>' : empty('Aún no hay partituras para tu instrumento y voz.')) + '</section></div></div></div>';
}

function bindHome(content) {
  content.innerHTML = home(state.data);
  const form = content.querySelector('.quick-attendance');
  if (!form) return;
  const id = form.dataset.rehearsal;
  bindForm(form, async (_, current, trigger) => {
    const value = trigger?.value;
    if (value !== 'yes' && value !== 'no') return;
    const event = state.data?.events.find(item => item.id === id);
    if (!event || event.cancelled || Date.parse(event.starts) <= Date.now()) {
      throw new Error('Las respuestas están cerradas para este ensayo.');
    }
    const pending = state.pending[id];
    const reason = value === 'no' ? (pending?.value === 'no' ? pending.reason : event.reason) ?? '' : '';
    await respond(event,value,reason);
    if (current.isConnected) {
      await render();
      shell.querySelector('.quick-attendance button[aria-pressed="true"]')?.focus({ preventScroll:true });
    }
  });
}

let noticeFilter = 'all';
function bindNotices(content, id) {
  const data = state.data;
  if (id) {
    const notice = data.notices.find(item => item.id === id);
    if (!notice) return void (content.innerHTML = back('Avisos','#/avisos') + empty('Aviso no encontrado.'));
    content.innerHTML = back('Avisos','#/avisos') + '<article class="card stack notice-detail">' +
      header(notice.title, displayTime(notice.created_at), '', 'Aviso') + '<p class="pre notice-message">' + esc(notice.message) + '</p>' +
      (notice.event_id ? row('Ver evento', '', '#/calendario/' + notice.event_id, 'calendario') : '') +
      (notice.read_at ? pill('Lectura confirmada · ' + displayTime(notice.read_at),'good') :
        state.offline ? pill('Pendiente de lectura','waiting') : '<form class="stack">' +
          errorRegion + '<button class="button primary">' + icon('check-ring') + 'Confirmar lectura</button>' +
          '<p class="muted align-center">Abrir el aviso no confirma su lectura.</p></form>') + '</article>' +
      (canManage(state.member.role) && !state.offline ? '<section class="card stack notice-receipts"><h2>Confirmaciones de lectura</h2>' +
        '<p class="muted" role="status">Consultando confirmaciones…</p></section>' : '');
    const receipts = content.querySelector('.notice-receipts p');
    if (receipts) api('/notices/' + id + '/receipts').then(({ total, confirmed }) => {
      receipts.textContent = confirmed + ' de ' + total + ' destinatarios han confirmado la lectura.';
    }).catch(error => { receipts.textContent = error.message; });
    const form = content.querySelector('form');
    if (form) bindForm(form, async () => {
      await api('/notices/' + id + '/read', 'PUT', {});
      await refresh();
      bindNotices(content,id);
      updateNoticeCount();
      toast('Lectura confirmada');
    });
    return;
  }
  const unread = data.notices.filter(item => !item.read_at);
  const list = noticeFilter === 'all' ? data.notices : unread;
  content.innerHTML = '<div class="inbox-view">' + header('Avisos','Información de la banda',
    canManage(state.member.role) && !state.offline ? '<a class="button primary" href="#/gestion/aviso">' + icon('plus') + 'Nuevo aviso</a>' : '') +
    segment('Filtrar avisos',[['unread','Pendientes · ' + unread.length,'bell'],['all','Todos','list']],noticeFilter) +
    '<div class="stack notice-list">' + (list.length ? list.map(item => '<article class="card stack notice-card' +
    (item.read_at ? '' : ' unread') + '">' +
    '<div class="event-labels"><p class="notice-date muted">' + icon('announce') + displayTime(item.created_at) + '</p>' +
    pill(item.read_at ? 'Lectura confirmada' : 'Lectura pendiente', item.read_at ? 'good' : 'accent') + '</div>' +
    '<h2><a href="#/avisos/' + esc(item.id) + '">' + esc(item.title) + '</a></h2><p class="muted excerpt">' + esc(item.message) +
    '</p><a class="button quiet event-action" href="#/avisos/' + esc(item.id) + '">Abrir aviso' + icon('right') + '</a></article>').join('') :
      empty(noticeFilter === 'all' ? 'Aún no hay avisos.' : 'Estás al día con tus avisos.')) + '</div></div>';
  content.querySelector('.segments').addEventListener('click', event => {
    const value = event.target.closest('button')?.dataset.value;
    if (value) {
      noticeFilter = value;
      bindNotices(content);
      content.querySelector('[aria-pressed="true"]').focus();
    }
  });
}

function profile(content, mode) {
  const member = state.member;
  const history = state.data.events.filter(event => Date.parse(event.starts) <= Date.now() || event.cancelled).reverse();
  if (mode === 'historial') {
    content.innerHTML = back('Perfil','#/perfil') + header('Mi historial','Intención y presencia por evento') +
      (history.length ? '<div class="stack">' + history.map(event => '<article class="card history">' +
      '<div><a href="#/calendario/' + event.id + '"><strong>' + esc(event.title) + '</strong></a><p class="muted">' +
      displayTime(event.starts) + (event.cancelled ? ' · Cancelado' : '') + '</p></div>' +
      '<dl><div><dt>Intención</dt><dd>' + pill(intention[event.intention],'waiting') + '</dd></div><div><dt>Presencia</dt><dd>' +
      pill(presence[event.presence], event.presence === 'present' ? 'good' : '') + '</dd></div></dl></article>').join('') + '</div>' : empty('Aún no hay eventos pasados.'));
    return;
  }
  if (mode === 'descargas') return downloads(content, context);
  if (mode === 'google') {
    content.innerHTML = back('Perfil','#/perfil') + header('Acceso con Google') +
      (member.google_linked ? empty('Tu cuenta de Calvario ya está vinculada con Google.') :
        state.google && !state.offline && member.password_enabled
        ? '<form class="card stack"><p>Confirma tu contraseña y selecciona en Google el mismo correo de tu cuenta.</p>' +
          field('password','Contraseña de Calvario','type="password" required maxlength="128" autocomplete="current-password"') +
          errorRegion + googleButton('Vincular cuenta de Google') + '</form>'
        : empty('La vinculación necesita conexión y una cuenta de Calvario con contraseña.'));
    const form = content.querySelector('form');
    if (form) bindGoogle(form,state.google,async (idToken,input) => {
      await api('/auth/google','POST',{ mode:'link',idToken,password:input.password });
      await refresh();
      profile(content,'google');
      toast('Cuenta de Google vinculada.');
    });
    return;
  }
  const verified = history.filter(event => !event.cancelled && ['present','absent'].includes(event.presence));
  const attended = verified.filter(event => event.presence === 'present').length;
  const rate = verified.length ? Math.round(attended * 100 / verified.length) : 0;
  const part = instrument(member);
  const ring = '<span class="attendance-ring" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false">' +
    '<circle cx="22" cy="22" r="19"/><circle cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="' + rate + ' 100"/>' +
    '</svg><span>' + (verified.length ? rate + '%' : '—') + '</span></span>';
  content.innerHTML = header('Mi perfil') + '<div class="profile-layout"><div class="stack">' +
    '<section class="card profile-card"><span class="avatar large">' + initials(member.name) +
    '</span><div class="profile-identity"><div class="profile-name"><h2>' + esc(member.name) + '</h2>' + pill(role[member.role],'accent') + '</div>' +
    (part ? '<p class="profile-part muted">' + icon('repertorio') + part + '</p>' : '') +
    (member.email ? '<p class="muted">' + esc(member.email) + '</p>' : '') + '</div></section>' +
    '<section>' + sectionTitle('Mi actividad') + '<div class="profile-activity">' +
    '<a class="card activity-tile" href="#/perfil/historial"><span class="activity-top"><span>Asistencia</span>' + ring + '</span><strong>' +
    (verified.length ? attended + ' de ' + verified.length : 'Mi historial') + '</strong><span class="muted">' +
    (verified.length ? 'Presencias comprobadas' : 'Intención y presencia') + '</span></a>' +
    '<a class="card activity-tile" href="#/perfil/descargas"><span class="activity-top"><span>Sin conexión</span><span class="tile">' +
    icon('download') + '</span></span><strong>' + state.saved.size + (state.saved.size === 1 ? ' partitura' : ' partituras') +
    '</strong><span class="muted">Guardadas en este dispositivo</span></a></div></section></div>' +
    '<div class="stack"><section>' + sectionTitle('Ajustes y cuenta') + '<div class="row-list">' +
    '<div class="row appearance-setting"><div><label for="theme-choice">Tema</label>' +
    '<p class="muted" id="theme-help">Se guarda en este dispositivo.</p></div>' +
    '<select id="theme-choice" aria-describedby="theme-help">' + options({ system:'Sistema',light:'Claro',dark:'Oscuro' },
      document.documentElement.dataset.themePreference ?? 'system') + '</select></div>' +
    (state.pushEnabled ? row('Notificaciones','Avisos en este dispositivo','#/perfil/notificaciones','avisos') : '') +
    (state.google ? row('Acceso con Google',member.google_linked ? 'Cuenta vinculada' : 'Vincular cuenta','#/perfil/google','perfil') : '') +
    '<div class="row actions">' + button('Actualizar datos','quiet','id="retry"') +
    '<button class="button quiet signout" id="signout">' + icon('exit') + 'Cerrar sesión</button></div></div></section>' +
    (!state.offline && canManage(member.role) ? '<section>' + sectionTitle('Herramientas de gestión','', 'gestion') + managementTools() + '</section>' : '') +
    '</div></div>';
  content.querySelector('#retry').addEventListener('click', bootstrap);
  content.querySelector('#signout').addEventListener('click', () => logout().catch(error => toast(error.message)));
}

const context = { state, api, refresh, render, toast, go, respond, confirmAction, setPending, networkFailure };

function updateConnectionBanner() {
  const slot = shell.querySelector('#connection');
  if (!slot || !state.data) return;
  const changes = Object.keys(state.pending).length;
  slot.innerHTML = state.offline || changes ? '<aside class="callout connection"><div><strong>' +
    (state.offline ? 'Sin conexión' : 'Respuestas por revisar') + '</strong><p>' +
    (state.offline ? 'Datos guardados · ' + displayTime(state.data.updatedAt) : '') +
    (changes ? (state.offline ? ' · ' : '') + changes + ' cambios locales' : '') +
    '</p></div>' + button('Reintentar','secondary','id="reconnect"') + '</aside>' : '';
  slot.querySelector('#reconnect')?.addEventListener('click', bootstrap);
}

function updateNoticeCount() {
  const badge = shell.querySelector('.nav-count');
  if (!badge) return;
  const count = state.data.notices.filter(notice => !notice.read_at).length;
  badge.hidden = !count;
  badge.textContent = count > 99 ? '99+' : count;
  badge.closest('a').setAttribute('aria-label', count ? 'Avisos, ' + count + ' sin leer' : 'Avisos');
}

async function render() {
  const token = ++rendering;
  const [rawRoute, id, action] = location.hash.replace(/^#\/?/,'').split('/');
  const route = rawRoute || 'inicio';
  if (mailRoutes.includes(route) || state.member?.status !== 'active' || !state.data) {
    lastPage = undefined;
    access(shell, { state, api, bootstrap, toast, logout, signIn }, route, id);
    return;
  }
  const active = route === 'gestion' ? 'perfil' : route;
  const pageLabel = route === 'gestion' ? 'Gestión' : destinations.find(([key]) => key === route)?.[1] ?? 'Calvario';
  const nav = destinations.map(([key,label]) => '<a href="#/' + key + '" ' +
    (active === key ? 'aria-current="page"' : '') + '><span class="nav-glyph">' + icon(key === 'avisos' ? 'bell' : key) +
    (key === 'avisos' ? '<span class="nav-count" aria-hidden="true" hidden></span>' : '') +
    '</span><span>' + label + '</span></a>').join('');
  const emblem = '<span class="brand-mark"><img src="./public/escudo.png" width="28" height="28" alt=""></span>';
  const brand = '<a class="brand" href="#/inicio">' + emblem + 'Calvario</a>';
  shell.innerHTML = '<a class="skip" href="#content">Saltar al contenido</a><div class="layout"><aside class="rail">' +
    brand + '<nav aria-label="Navegación principal">' + nav +
    (!state.offline && canManage(state.member.role) ? '<a href="#/gestion"' + (route === 'gestion' ? ' aria-current="page"' : '') +
    '>' + icon('gestion') + '<span>Gestión</span></a>' : '') +
    '</nav><a class="rail-footer" href="#/perfil"><span class="avatar">' + initials(state.member.name) + '</span>' +
    '<span class="rail-person"><strong>' + esc(state.member.name) + '</strong><span>' + esc(role[state.member.role]) + '</span></span></a>' +
    '</aside><div class="main-area">' +
    '<div class="mobile-brand"><div class="mobile-heading"><a class="mobile-emblem" href="#/inicio" aria-label="Inicio de Calvario">' +
    emblem + '</a><span>' + esc(pageLabel) + '</span></div><a class="avatar" href="#/perfil" aria-label="Mi perfil">' +
    initials(state.member.name) + '</a></div><main id="content" tabindex="-1">' +
    '<div id="connection"></div><div id="view" data-section="' + esc(route) + '" data-root="' + (!id) + '"></div></main></div></div>';
  const skip = shell.querySelector('.skip');
  skip.addEventListener('click', event => { event.preventDefault(); shell.querySelector('main').focus(); });
  updateConnectionBanner();
  updateNoticeCount();
  const content = shell.querySelector('#view');
  try {
    if (route === 'inicio') bindHome(content);
    else if (route === 'calendario' && !id) calendar(content, context);
    else if (route === 'calendario' && (id === 'nuevo' || action === 'editar')) await eventEditor(content, context, id);
    else if (route === 'calendario' && action === 'formacion') await formationEditor(content, context, id);
    else if (route === 'calendario') await eventPage(content, context, id, action);
    else if (route === 'repertorio') repertoire(content, context, id, action);
    else if (route === 'avisos') bindNotices(content, id);
    else if (route === 'perfil' && id === 'notificaciones') await pushSettings(content,context);
    else if (route === 'perfil') profile(content, id);
    else if (route === 'gestion' && id === 'aviso') composeNotice(content, context);
    else if (route === 'gestion' && id === 'asistencia') attendanceReportPage(content, context);
    else if (route === 'gestion' && id === 'material') await materialPage(content,context,action);
    else if (route === 'gestion' && id === 'catalogo') catalogPage(content,context);
    else if (route === 'gestion') await management(content, context, id, action);
    else content.innerHTML = header('Página no encontrada') + link('Volver al inicio','#/inicio');
  } catch (error) {
    if (token !== rendering) return;
    networkFailure(error);
    content.innerHTML = empty(error.message) + link('Volver al inicio','#/inicio');
  }
  if (token === rendering) {
    const page = [route,id,action].join('/');
    if (lastPage !== page) content.classList.add('view-enter');
    lastPage = page;
    const heading = content.querySelector('h1');
    document.title = (heading ? heading.textContent + ' · ' : '') + 'Calvario';
    heading?.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', () => { window.scrollTo(0,0); render(); });
window.addEventListener('online', bootstrap);
window.addEventListener('offline', () => {
  if (state.member && !state.offline) toast('Sin conexión. Se mostrarán los datos guardados.');
  state.offline = true;
  updateConnectionBanner();
});
window.addEventListener('focus', () => {
  if (navigator.onLine && localSignoutPending()) bootstrap();
});
setInterval(() => {
  if (navigator.onLine && localSignoutPending()) bootstrap();
}, 5000);
window.addEventListener('storage', event => {
  if (event.key === 'calvario:v1:account' && getLocal().account !== state.member?.id) bootstrap();
});
if (hosted) shell.addEventListener('click',event => {
  const link = event.target.closest?.('a[href^="/api/"]');
  if (!link) return;
  event.preventDefault();
  openPrivateLink(link).catch(error => toast(error.message));
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
shell.innerHTML = '<main class="loading" role="status">Cargando Calvario…</main>';
await bootstrap();
