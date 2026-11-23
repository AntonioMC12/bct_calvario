import { area, back, bindForm, button, displayTime, empty, errorRegion, esc, eventCard, field, fullDate, header, icon,
  initials, instrument, intention, link, matchesScore, pill, presence, role, row, sectionTitle, segment } from './ui.js';
import { cacheDashboard, clearLocalSignout, clearPrivate, getLocal, localSignoutPending, markLocalSignout, savePending, savedFiles } from './storage.js';
import { calendar, eventPage } from './events.js';
import { repertoire, downloads } from './repertoire.js';
import { management, eventEditor, formationEditor, composeNotice } from './management.js';

const shell = document.querySelector('#shell');
const dialog = document.querySelector('#dialog');
const status = document.querySelector('#feedback');
const destinations = [['inicio','Inicio'], ['calendario','Calendario'], ['repertorio','Repertorio'], ['avisos','Avisos'], ['perfil','Perfil']];
const state = { member: null, data: null, pending: {}, saved: new Set(), offline: false, cacheReady: false };
let rendering = 0;
let toastTimer;

export async function api(path, method = 'GET', data, timeout = 12000) {
  let response;
  const headers = {};
  if (state.member?.id && path !== '/login' && path !== '/request-access' && path !== '/logout' && path !== '/session') {
    headers['X-Calvario-Account'] = state.member.id;
  }
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  try {
    response = await fetch('/api' + path, {
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
  state.cacheReady = false;
  await clearPrivate();
}

function networkFailure(error) {
  if (error.status === 401 || error.code === 'inactive' || error.code === 'account_changed') {
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
  state.offline = false;
  state.cacheReady = false;
  try {
    cacheDashboard(data);
    state.cacheReady = true;
  } catch (error) {
    toast(error.message);
  }
  state.pending = local.account === data.member.id ? local.pending : {};
  state.saved = await savedFiles(data.member.id).catch(() => new Set());
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
    const { member } = await api('/session');
    state.offline = false;
    local = getLocal();
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
      state.saved = await savedFiles(state.member?.id).catch(() => new Set());
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
  await reset();
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

function loginView(route) {
  const requesting = route === 'solicitud';
  const pending = state.member?.status === 'pending';
  const blocked = state.member && state.member.status !== 'active';
  shell.innerHTML = '<main class="access"><div class="access-brand"><img src="/public/escudo.png" alt="Escudo de Calvario" width="210" height="210">' +
    '<p>Banda de Cornetas y Tambores<br>Santísimo Cristo del Calvario</p></div><div class="access-body">' +
    '<section class="access-panel">' +
    (blocked ? header(pending ? 'Solicitud pendiente' : 'Acceso bloqueado', state.member.name) +
      '<p class="muted">' + (pending ? 'Tu solicitud está pendiente de revisión por la banda.' : 'Tu cuenta no tiene una membresía activa.') + '</p>' +
      '<div class="actions">' + (pending ? button('Comprobar estado', 'primary','id="retry"') : '') +
      button('Cerrar sesión','secondary','id="signout"') + '</div>'
    : (requesting ? back('Acceso', '#/inicio') : '') + header(requesting ? 'Únete a la banda' : 'Acceso a la banda',
      requesting ? 'Tu solicitud requiere aprobación.' : '') +
    (state.offline ? '<p class="callout">Necesitas conexión para entrar o solicitar acceso.</p>' : '') +
    '<form class="stack" id="access-form">' + (requesting ? field('name','Nombre y apellidos','required autocomplete="name" maxlength="120"') : '') +
    field('email','Correo electrónico','type="email" required autocomplete="email" maxlength="254"') +
    field('password','Contraseña','type="password" required maxlength="128" autocomplete="' + (requesting ? 'new-password" minlength="12"' : 'current-password"')) +
    (requesting ? '<div class="field-grid">' + field('instrument','Instrumento','required maxlength="80"') + field('voice','Voz','maxlength="80"') + '</div>' : '') +
    errorRegion + button(requesting ? 'Enviar solicitud' : 'Entrar') + '</form>' +
    (requesting ? '' : '<p class="access-footer">¿Aún no tienes cuenta? ' + link('Solicitar acceso', '#/solicitud') + '</p>')) +
    '</section></div></main>';
  shell.querySelector('#retry')?.addEventListener('click', bootstrap);
  shell.querySelector('#signout')?.addEventListener('click', () => logout().catch(error => toast(error.message)));
  const form = shell.querySelector('#access-form');
  if (form) bindForm(form, async input => {
    if (localSignoutPending()) {
      await api('/logout', 'POST', {});
      clearLocalSignout();
    }
    await api(requesting ? '/request-access' : '/login', 'POST', input);
    go('#/inicio');
    await bootstrap();
  });
}

function home(data) {
  const next = data.events.find(event => !event.cancelled && Date.parse(event.starts) > Date.now());
  const unread = data.notices.filter(item => !item.read_at).length;
  const personal = data.works.flatMap(work => work.scores.filter(file => matchesScore(file, data.member))
    .map(file => ({ work, file }))).slice(0,3);
  return header('Tu banda, al día.', '', '<a class="avatar" href="#/perfil" aria-label="Mi perfil">' + initials(data.member.name) + '</a>', fullDate(new Date())) +
    (unread ? '<a class="callout banner" href="#/avisos">' + icon('avisos') + '<span><strong>' +
      (unread === 1 ? 'Tienes un aviso por leer' : 'Tienes ' + unread + ' avisos por leer') +
      '</strong><span>Consulta las novedades de la banda.</span></span>' + icon('right') + '</a>' : '') +
    '<div class="home-grid"><section>' + sectionTitle('Próximo evento', link('Calendario','#/calendario')) +
    (next ? eventCard(next, state.pending[next.id]) : empty('No hay próximas convocatorias.')) +
    '</section><section>' + sectionTitle('Para tu instrumento', link('Ver todas','#/repertorio')) +
    (personal.length ? '<div class="row-list">' + personal.map(({ work, file }) =>
      row(work.title, [file.instrument, file.voice, 'PDF'].filter(Boolean).join(' · '), '#/repertorio/' + work.id, 'repertorio')).join('') +
    '</div>' : empty('Aún no hay partituras para tu instrumento y voz.')) + '</section></div>';
}

let noticeFilter = 'all';
function bindNotices(content, id) {
  const data = state.data;
  if (id) {
    const notice = data.notices.find(item => item.id === id);
    if (!notice) return void (content.innerHTML = back('Avisos','#/avisos') + empty('Aviso no encontrado.'));
    content.innerHTML = back('Avisos','#/avisos') + header(notice.title, displayTime(notice.created_at)) +
      '<article class="card stack"><p class="pre">' + esc(notice.message) + '</p>' +
      (notice.event_id ? row('Ver evento', '', '#/calendario/' + notice.event_id, 'calendario') : '') +
      (notice.read_at ? pill('Lectura confirmada · ' + displayTime(notice.read_at),'good') :
        state.offline ? pill('Pendiente de lectura') : '<form>' + errorRegion + button('Confirmar lectura') + '</form>') + '</article>';
    const form = content.querySelector('form');
    if (form) bindForm(form, async () => {
      await api('/notices/' + id + '/read', 'PUT', {});
      await refresh();
      bindNotices(content,id);
      toast('Lectura confirmada');
    });
    return;
  }
  const unread = data.notices.filter(item => !item.read_at);
  const list = noticeFilter === 'all' ? data.notices : unread;
  content.innerHTML = header('Avisos','Información de la banda',
    state.member.role === 'director' && !state.offline ? link('Nuevo aviso','#/gestion/aviso') : '') +
    segment('Filtrar avisos',[['all','Todos'],['unread','Pendientes · ' + unread.length]],noticeFilter) +
    '<div class="row-list notice-list">' + (list.length ? list.map(item => '<a class="row" href="#/avisos/' + item.id + '">' +
    '<span class="tile">' + icon('avisos') + '</span><span class="row-copy"><strong>' + esc(item.title) + '</strong>' +
    '<span class="muted excerpt">' + esc(item.message) + '</span><span class="muted">' + displayTime(item.created_at) +
    '</span></span>' + pill(item.read_at ? 'Leído' : 'Pendiente', item.read_at ? '' : 'accent') + '</a>').join('') :
      empty(noticeFilter === 'all' ? 'Aún no hay avisos.' : 'Estás al día con tus avisos.')) + '</div>';
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
  if (mode === 'historial') {
    const events = state.data.events.filter(event => Date.parse(event.starts) <= Date.now() || event.cancelled).reverse();
    content.innerHTML = back('Perfil','#/perfil') + header('Mi historial','Intención y presencia por evento') +
      (events.length ? '<div class="stack">' + events.map(event => '<article class="card history">' +
      '<div><a href="#/calendario/' + event.id + '"><strong>' + esc(event.title) + '</strong></a><p class="muted">' +
      displayTime(event.starts) + (event.cancelled ? ' · Cancelado' : '') + '</p></div>' +
      '<dl><div><dt>Intención</dt><dd>' + intention[event.intention] + '</dd></div><div><dt>Presencia</dt><dd>' +
      presence[event.presence] + '</dd></div></dl></article>').join('') + '</div>' : empty('Aún no hay eventos pasados.'));
    return;
  }
  if (mode === 'descargas') return downloads(content, context);
  content.innerHTML = header('Mi perfil') + '<section class="card profile-card"><span class="avatar large">' + initials(member.name) +
    '</span><div><h2>' + esc(member.name) + '</h2><p class="muted">' + instrument(member) +
    '</p>' + (member.email ? '<p class="muted">' + esc(member.email) + '</p>' : '') + pill(role[member.role]) + '</div></section>' +
    '<div class="row-list">' + row('Mi historial','Intención y presencia','#/perfil/historial','clock') +
    row('Descargas', state.saved.size + ' partituras guardadas','#/perfil/descargas','file') +
    (!state.offline && member.role !== 'musician' ? row('Gestión','Herramientas de tu perfil','#/gestion','gestion') : '') + '</div>' +
    '<div class="actions">' + button('Actualizar datos','secondary','id="retry"') + button('Cerrar sesión','secondary','id="signout"') + '</div>';
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

async function render() {
  const token = ++rendering;
  const [rawRoute, id, action] = location.hash.replace(/^#\/?/,'').split('/');
  const route = rawRoute || 'inicio';
  if (state.member?.status !== 'active' || !state.data) {
    loginView(route);
    return;
  }
  const active = route === 'gestion' ? 'perfil' : route;
  const nav = destinations.map(([key,label]) => '<a href="#/' + key + '" ' +
    (active === key ? 'aria-current="page"' : '') + '>' + icon(key) + '<span>' + label + '</span></a>').join('');
  shell.innerHTML = '<a class="skip" href="#content">Saltar al contenido</a><div class="layout"><aside class="rail">' +
    '<a class="brand" href="#/inicio">CALVARIO</a><nav aria-label="Navegación principal">' + nav +
    (!state.offline && state.member.role !== 'musician' ? '<a href="#/gestion"' + (route === 'gestion' ? ' aria-current="page"' : '') +
    '>' + icon('gestion') + '<span>Gestión</span></a>' : '') +
    '</nav><span class="rail-footer">Banda de Cornetas y Tambores</span></aside><div class="main-area">' +
    '<div class="mobile-brand"><a class="brand" href="#/inicio">Calvario</a></div><main id="content" tabindex="-1">' +
    '<div id="connection"></div><div id="view"></div></main></div></div>';
  const skip = shell.querySelector('.skip');
  skip.addEventListener('click', event => { event.preventDefault(); shell.querySelector('main').focus(); });
  updateConnectionBanner();
  const content = shell.querySelector('#view');
  try {
    if (route === 'inicio') content.innerHTML = home(state.data);
    else if (route === 'calendario' && !id) calendar(content, context);
    else if (route === 'calendario' && (id === 'nuevo' || action === 'editar')) await eventEditor(content, context, id);
    else if (route === 'calendario' && action === 'formacion') await formationEditor(content, context, id);
    else if (route === 'calendario') await eventPage(content, context, id, action);
    else if (route === 'repertorio') repertoire(content, context, id);
    else if (route === 'avisos') bindNotices(content, id);
    else if (route === 'perfil') profile(content, id);
    else if (route === 'gestion' && id === 'aviso') composeNotice(content, context);
    else if (route === 'gestion') await management(content, context, id);
    else content.innerHTML = header('Página no encontrada') + link('Volver al inicio','#/inicio');
  } catch (error) {
    if (token !== rendering) return;
    networkFailure(error);
    content.innerHTML = empty(error.message) + link('Volver al inicio','#/inicio');
  }
  if (token === rendering) {
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
shell.innerHTML = '<main class="loading" role="status">Cargando Calvario…</main>';
await bootstrap();
