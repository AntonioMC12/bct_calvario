import { backend } from './connection.js';
import { canManage } from './roles.js';
import { samePart } from './parts.js';

const prefix = 'calvario:v1:';
const accountKey = prefix + 'account';
const signoutKey = 'calvario:cerrar-sesion-pendiente';
export const localSignoutPending = () => Boolean(read(signoutKey));
export const markLocalSignout = () => write(signoutKey, true);
export const clearLocalSignout = () => localStorage.removeItem(signoutKey);

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function getLocal() {
  const account = read(accountKey);
  if (!account) return { account: null, dashboard: null, pending: {} };
  let dashboard = read(prefix + account + ':dashboard');
  if (dashboard && Date.now() - Date.parse(dashboard.updatedAt) < 86400000) {
    const member = dashboard.member.role === 'admin' ? { ...dashboard.member, role:'director' } : dashboard.member;
    dashboard = { ...dashboard, member, works:offlineWorks(dashboard.works,member) };
  } else dashboard = null;
  return {
    account,
    dashboard,
    pending: read(prefix + account + ':queue') ?? {},
  };
}

function offlineWorks(works, member) {
  return works.map(work => ({ ...work, scores:work.scores.filter(file =>
    file.approved && !file.archived && (canManage(member.role) || samePart(file,member))) })).filter(work => work.scores.length);
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('No se ha podido guardar en este dispositivo. Comprueba el espacio disponible.');
  }
}

export function cacheDashboard(data) {
  const member = data.member;
  const day = 86400000;
  const timestamp = Date.parse(data.updatedAt);
  const dashboard = {
    ...data,
    member: { ...member, email: '' },
    events: data.events.filter(event => {
      const starts = Date.parse(event.starts);
      return starts > timestamp - 30 * day && starts < timestamp + 90 * day;
    }).map(event => ({ ...event, reason: '' })),
    notices: data.notices.filter(notice => Date.parse(notice.created_at) > timestamp - 30 * day).slice(0,50),
    works: offlineWorks(data.works,member),
  };
  write(prefix + member.id + ':dashboard', dashboard);
  write(accountKey, member.id);
}

export function savePending(account, pending) {
  if (Object.keys(pending).length) write(prefix + account + ':queue', pending);
  else localStorage.removeItem(prefix + account + ':queue');
}

const pdfCache = id => 'calvario-pdf-v1-' + id;
const fileUrl = file => '/api/files/' + file.id;

export async function savedFiles(account, works = []) {
  if (!globalThis.caches || !account) return new Set();
  const cache = await caches.open(pdfCache(account));
  const allowed = new Set(works.flatMap(work => work.scores.filter(file => file.approved && !file.archived).map(file => file.id)));
  const saved = new Set();
  for (const request of await cache.keys()) {
    const id = new URL(request.url).pathname.split('/').at(-1);
    if (allowed.has(id)) saved.add(id);
    else await cache.delete(request);
  }
  return saved;
}

export async function savePdf(account, file) {
  if (!globalThis.caches || getLocal().account !== account) throw new Error('Las descargas no están disponibles.');
  const response = await backend('/files/' + file.id,{ headers:{ 'X-Calvario-Account':account } });
  if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
    const error = new Error('No se ha podido descargar la partitura.');
    error.status = response.status;
    throw error;
  }
  if (getLocal().account !== account) throw new Error('La cuenta ha cambiado.');
  const cache = await caches.open(pdfCache(account));
  const keys = await cache.keys();
  if (keys.length >= 20 && !await cache.match(fileUrl(file))) {
    throw new Error('Has llegado al máximo de 20 partituras guardadas. Retira una descarga para continuar.');
  }
  await cache.put(fileUrl(file), response);
  if (getLocal().account !== account) await caches.delete(pdfCache(account));
}

export async function removePdf(account, file) {
  if (globalThis.caches) await (await caches.open(pdfCache(account))).delete(fileUrl(file));
}

async function localPdfUrl(account, file) {
  const local = getLocal();
  if (local.account !== account) throw new Error('La cuenta ha cambiado.');
  if (!local.dashboard?.works.some(work => work.scores.some(item => item.id === file.id))) {
    throw new Error('La partitura guardada ya no está disponible. Conéctate para actualizar el repertorio.');
  }
  const response = await (await caches.open(pdfCache(account))).match(fileUrl(file));
  if (!response) throw new Error('La partitura no está guardada.');
  const url = URL.createObjectURL(await response.blob());
  if (getLocal().account !== account) {
    URL.revokeObjectURL(url);
    throw new Error('La cuenta ha cambiado.');
  }
  return url;
}

export async function openSavedPdf(account, file) {
  const viewer = window.open('about:blank', '_blank');
  if (!viewer) throw new Error('Permite abrir una nueva pestaña o elige Exportar copia guardada.');
  viewer.opener = null;
  let url;
  try {
    url = await localPdfUrl(account,file);
    viewer.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    viewer.close();
    throw error;
  }
}

export async function downloadPdf(account, file) {
  const url = await localPdfUrl(account,file);
  exportFile(url,file.name);
}

export async function downloadScores(account, ids) {
  const response = await backend('/scores/export',{
    method:'POST', headers:{ 'X-Calvario-Account':account, 'Content-Type':'application/json' },
    body:JSON.stringify(ids ? { ids } : {}), cache:'no-store',
  });
  if (!response.ok || response.headers.get('content-type') !== 'application/zip') {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || 'No se ha podido descargar el lote de partituras.');
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  const blob = await response.blob();
  if (getLocal().account !== account) throw new Error('La cuenta ha cambiado.');
  exportFile(URL.createObjectURL(blob),'calvario-partituras.zip');
}

function exportFile(url,name) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function clearPrivate() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
  if (globalThis.caches) {
    for (const key of await caches.keys()) {
      if (key.startsWith('calvario-pdf-')) await caches.delete(key);
    }
  }
}
