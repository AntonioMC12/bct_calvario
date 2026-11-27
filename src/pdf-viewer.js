import { esc, icon } from './ui.js';
import { downloadPdf, scorePdf } from './storage.js';

let activeViewer;
let library;
const assets = new URL('../public/pdfjs/',import.meta.url);

export function showPdfViewer(file,ctx) {
  activeViewer?.();
  const account = ctx.state.member.id;
  const saved = ctx.state.saved.has(file.id);
  const dialog = document.createElement('dialog');
  dialog.className = 'pdf-viewer';
  dialog.setAttribute('aria-labelledby','pdf-viewer-title');
  dialog.innerHTML = '<header class="pdf-viewer-head"><div><h2 id="pdf-viewer-title">' + esc(file.title || file.name) +
    '</h2><p class="muted">' + esc([file.instrument,file.voice].filter(Boolean).join(' · ')) + '</p></div>' +
    '<button type="button" class="button quiet" data-close aria-label="Cerrar visor">' + icon('close') + 'Cerrar</button></header>' +
    '<div class="pdf-toolbar" role="group" aria-label="Controles de la partitura">' +
    '<button type="button" class="button secondary" data-prev aria-label="Página anterior" disabled>‹</button>' +
    '<span data-page aria-live="polite">Cargando…</span>' +
    '<button type="button" class="button secondary" data-next aria-label="Página siguiente" disabled>›</button>' +
    '<button type="button" class="button quiet" data-out aria-label="Reducir zoom" disabled>−</button>' +
    '<button type="button" class="button quiet" data-fit disabled>Ajustar</button>' +
    '<button type="button" class="button quiet" data-in aria-label="Ampliar zoom" disabled>+</button>' +
    '<button type="button" class="button secondary" data-download aria-label="Descargar partitura" disabled>' + icon('download') + '<span>Descargar</span></button></div>' +
    '<p class="pdf-feedback muted" role="status">Cargando partitura…</p><div class="pdf-paper" tabindex="0" aria-label="Partitura">' +
    '<canvas role="img" aria-label="Página de la partitura"></canvas></div>';
  document.body.append(dialog);
  const origin = document.activeElement;
  const paper = dialog.querySelector('.pdf-paper');
  const canvas = dialog.querySelector('canvas');
  const feedback = dialog.querySelector('.pdf-feedback');
  const controls = Object.fromEntries(['prev','next','out','fit','in','download','page'].map(name => [name,dialog.querySelector('[data-' + name + ']')]));
  let closed = false, documentPdf, loading, rendering, pageNumber = 1, zoom = 1;
  const close = () => {
    if (closed) return;
    closed = true;
    rendering?.cancel();
    loading?.destroy().catch(() => {});
    dialog.close();
    dialog.remove();
    window.removeEventListener('hashchange',close);
    window.removeEventListener('calvario:private-cleared',close);
    if (activeViewer === close) activeViewer = undefined;
    if (origin?.isConnected) origin.focus();
  };
  activeViewer = close;
  window.addEventListener('hashchange',close);
  window.addEventListener('calvario:private-cleared',close);
  dialog.addEventListener('close',close,{once:true});
  dialog.querySelector('[data-close]').onclick = close;
  dialog.showModal();
  function ready(busy) {
    controls.prev.disabled = busy || pageNumber <= 1;
    controls.next.disabled = busy || pageNumber >= documentPdf.numPages;
    controls.out.disabled = busy || zoom <= .5;
    controls.in.disabled = busy || zoom >= 3;
    controls.fit.disabled = busy;
  }
  async function render() {
    if (closed || !documentPdf) return;
    ready(true);
    try {
      const page = await documentPdf.getPage(pageNumber);
      if (closed) return;
      const base = page.getViewport({scale:1});
      const fit = Math.max(120,paper.clientWidth - 24) / base.width;
      const viewport = page.getViewport({scale:fit * zoom});
      const pixels = Math.min(devicePixelRatio || 1,2,Math.sqrt(5000000 / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * pixels);
      canvas.height = Math.floor(viewport.height * pixels);
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      canvas.setAttribute('aria-label','Página ' + pageNumber + ' de ' + documentPdf.numPages);
      rendering = page.render({canvasContext:canvas.getContext('2d'),viewport,
        transform:pixels === 1 ? null : [pixels,0,0,pixels,0,0],annotationMode:0});
      await rendering.promise;
      if (closed) return;
      feedback.textContent = '';
      feedback.hidden = true;
      controls.page.textContent = pageNumber + ' / ' + documentPdf.numPages;
      paper.scrollTo(0,0);
    } catch (error) {
      if (!closed) { feedback.hidden = false; feedback.textContent = 'No se ha podido mostrar esta página. Puedes descargar la partitura.'; }
    } finally { if (!closed) ready(false); }
  }
  controls.prev.onclick = () => { pageNumber--; render(); };
  controls.next.onclick = () => { pageNumber++; render(); };
  controls.out.onclick = () => { zoom = Math.max(.5,zoom - .25); render(); };
  controls.in.onclick = () => { zoom = Math.min(3,zoom + .25); render(); };
  controls.fit.onclick = () => { zoom = 1; render(); };
  controls.download.onclick = async () => {
    controls.download.disabled = true;
    try { await downloadPdf(account,file,saved); }
    catch (error) { ctx.networkFailure(error); if (!closed) ctx.toast(error.message); }
    finally { if (!closed) controls.download.disabled = false; }
  };
  (async () => {
    try {
      const blob = await scorePdf(account,file,saved);
      if (closed || ctx.state.member?.id !== account) return close();
      controls.download.disabled = false;
      library ??= import(new URL('pdf.min.mjs',assets).href).catch(error => { library = undefined; throw error; });
      const pdfjs = await library;
      if (closed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs',assets).href;
      const data = new Uint8Array(await blob.arrayBuffer());
      if (closed) return;
      loading = pdfjs.getDocument({data,
        standardFontDataUrl:new URL('standard_fonts/',assets).href,cMapUrl:new URL('cmaps/',assets).href,
        cMapPacked:true,wasmUrl:new URL('wasm/',assets).href,isEvalSupported:false,enableXfa:false});
      documentPdf = await loading.promise;
      await render();
    } catch (error) {
      if (closed) return;
      ctx.networkFailure(error);
      if (closed) return;
      feedback.hidden = false;
      feedback.textContent = error.message || 'No se ha podido cargar la partitura.';
      controls.page.textContent = 'No disponible';
    }
  })();
}
