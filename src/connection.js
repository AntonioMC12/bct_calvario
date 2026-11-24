import { apiBase } from './runtime.js';

export const hosted = apiBase !== '/api';
const key = 'calvario:session:' + new URL('../',import.meta.url).pathname;
const pendingKey = key + ':logout';
let session = hosted ? sessionStorage.getItem(key) : null;

export function suspendSession() {
  if (hosted && session) sessionStorage.setItem(pendingKey,session);
  clearSession();
}

export function clearSession() {
  session = null;
  if (hosted) sessionStorage.removeItem(key);
}

export function captureSession(path,result) {
  if (!hosted) return;
  if (path === '/logout') {
    sessionStorage.removeItem(pendingKey);
    clearSession();
  } else if (typeof result.sessionToken === 'string' && /^[a-f0-9]{64}$/.test(result.sessionToken)) {
    session = result.sessionToken;
    sessionStorage.setItem(key,session);
    delete result.sessionToken;
  }
}

export function backend(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = path === '/logout' && hosted ? session || sessionStorage.getItem(pendingKey) : session;
  if (token) headers.set('X-Calvario-Session',token);
  return fetch(apiBase + path,{ cache:'no-store', ...options,headers,
    credentials:hosted ? 'omit' : 'same-origin' });
}

export async function openPrivateLink(anchor) {
  const path = anchor.getAttribute('href').slice(4);
  const pdf = path.startsWith('/files/');
  const viewer = pdf ? window.open('about:blank','_blank') : null;
  if (viewer) viewer.opener = null;
  let url;
  try {
    const response = await backend(path,{ signal:AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('No se pudo descargar el documento.');
    const filename = response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    url = URL.createObjectURL(await response.blob());
    if (viewer) viewer.location.replace(url);
    else {
      const download = document.createElement('a');
      download.href = url;
      download.download = filename ? decodeURIComponent(filename) : (pdf ? 'partitura.pdf' : 'calvario.ics');
      download.click();
    }
    setTimeout(() => URL.revokeObjectURL(url),pdf ? 300000 : 60000);
  } catch (error) {
    viewer?.close();
    if (url) URL.revokeObjectURL(url);
    throw error;
  }
}
