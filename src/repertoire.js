import { actionLink, back, bindForm, button, empty, errorRegion, esc, field, header, icon, instrument, matchesScore, normalize,
  options, pill, row, sectionTitle, segment } from './ui.js';
import { downloadPdf, downloadScores, openSavedPdf, removePdf, savePdf } from './storage.js';
import { pdfContent } from './management.js';
import { canManage } from './roles.js';
import { optionLists } from './part-options.js';

let scope = 'mine';
let query = '';
let genre = '';
const canManageScores = state => !state.offline && canManage(state.member.role);

export function repertoire(content, ctx, id, action) {
  if (id === 'archivo') return archive(content,ctx);
  if (id === 'validacion') return validation(content,ctx);
  if (id === 'descarga') return downloadSelection(content,ctx);
  if (id === 'reemplazo') return replacement(content,ctx,action);
  if (id) return workPage(content,ctx,id);
  const { state } = ctx;
  const management = canManage(state.member.role);
  const currentScope = () => management ? scope : 'mine';
  const genres = [...new Set(state.data.works.map(work => work.genre).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es'));
  if (!genres.includes(genre)) genre = '';
  const uploadTools = canManageScores(state) ? '<div class="catalog-management" role="group" aria-label="Gestión de partituras">' +
    '<a class="button primary" href="#/repertorio/archivo">' + icon('upload') + '<span>Cargar partituras</span></a>' +
    '<a class="button secondary" href="#/repertorio/validacion">' + icon('check-ring') + '<span>Validar partituras</span></a></div>' : '';
  const hasPublished = state.data.works.some(work => work.scores.some(file => file.approved && !file.archived));
  const downloadTools = !state.offline && hasPublished ?
    (!management ? '<button class="button primary" type="button" id="download-mine">' + icon('download') +
      'Descargar mis partituras</button>' : '') + actionLink('Descarga por lotes','#/repertorio/descarga','download') : '';
  const tools = uploadTools || downloadTools ? '<div class="catalog-actions">' + uploadTools +
    (downloadTools ? '<div class="actions">' + downloadTools + '</div>' : '') + '</div>' : '';
  content.innerHTML = header('Repertorio',management ? 'Partituras de la banda' : 'Partituras para tu instrumento y voz') + tools +
    '<div class="stack catalog-panel"><div class="card catalog-filters"><div class="search-field">' + icon('search') +
    '<label><span class="sr-only">Buscar por título, autoría o género</span><input type="search" name="query" autocomplete="off" ' +
    'placeholder="Buscar partituras" value="' + esc(query) + '"></label></div>' +
    '<label>Género<select name="genre"><option value="">Todos los géneros</option>' +
    options(Object.fromEntries(genres.map(value => [value,value])),genre) + '</select></label></div>' +
    (management ? segment('Partituras',[['mine','Mis partituras','repertorio'],['all','Todas','list']],scope) : '') +
    '<div id="catalog-part" class="catalog-part"></div></div><div id="works" class="stack"></div>';
  const search = content.querySelector('input');
  const genreControl = content.querySelector('[name="genre"]');
  const tabs = content.querySelector('.segments');
  const list = content.querySelector('#works');
  const visible = () => state.data.works.filter(work => (currentScope() === 'all' ?
    work.scores.some(file => !file.archived && (file.approved || canManageScores(state))) :
    work.scores.some(file => matchesScore(file,state.member))) &&
    (!genre || genre === work.genre) && normalize(work.title + ' ' + work.authors + ' ' + work.genre).includes(normalize(query)));

  function show() {
    const works = visible();
    const part = instrument(state.member);
    const scopeHint = content.querySelector('#catalog-part');
    scopeHint.hidden = currentScope() !== 'mine' || !part;
    scopeHint.innerHTML = part ? '<span class="tile">' + icon('repertorio') +
      '</span><div><p class="eyebrow">Tu atril</p><strong>' + part + '</strong></div>' : '';
    list.innerHTML = works.length ? [...Map.groupBy(works,work => work.genre || 'Sin género')].map(([group,items]) =>
      '<section class="stack catalog-group">' + sectionTitle(group) + '<div class="catalog-grid">' + items.map(work => {
        const preferred = work.scores.find(file => matchesScore(file,state.member));
        const file = preferred ?? (currentScope() === 'all' ? work.scores.find(file => !file.archived) : undefined);
        return '<article class="card stack catalog-work"><div class="member-heading"><span class="tile">' + icon('repertorio') +
          '</span><div><h3>' + esc(work.title) + '</h3><p class="muted">' +
          [work.authors,work.genre].filter(Boolean).map(esc).join(' · ') + '</p></div></div>' +
          (file ? scoreRow(file,ctx) : '') + '<a class="button quiet event-action" href="#/repertorio/' + esc(work.id) +
          '">Ver obra' + icon('right') + '</a></article>';
      }).join('') + '</div></section>').join('') :
      empty(query || genre ? 'No hay obras que coincidan con la búsqueda.' :
        currentScope() === 'mine' ? 'Aún no hay partituras para tu instrumento y voz.' : 'El catálogo aún no tiene partituras disponibles.');
    bindScores(list,ctx,works.flatMap(work => work.scores),show);
  }

  search.oninput = () => { query = search.value; show(); };
  genreControl.onchange = () => { genre = genreControl.value; show(); };
  if (tabs) tabs.onclick = event => {
    const selected = event.target.closest('button');
    if (!selected) return;
    scope = selected.dataset.value;
    for (const control of tabs.querySelectorAll('button')) control.setAttribute('aria-pressed',String(control === selected));
    show();
  };
  const download = content.querySelector('#download-mine');
  if (download) download.onclick = () => runDownload(download,ctx);
  show();
}

async function runDownload(control,ctx,ids) {
  control.disabled = true;
  try {
    await downloadScores(ctx.state.member.id,ids);
  } catch (error) {
    ctx.networkFailure(error);
    ctx.toast(error.message);
  } finally {
    control.disabled = false;
  }
}

function downloadSelection(content,ctx) {
  const previous = back('Repertorio','#/repertorio');
  if (ctx.state.offline) {
    content.innerHTML = previous + empty('Conéctate para descargar un lote de partituras.');
    return;
  }
  const files = ctx.state.data.works.flatMap(work => work.scores.filter(file => file.approved && !file.archived)
    .map(file => ({ ...file, title:work.title, authors:work.authors })));
  content.innerHTML = previous + header('Descarga por lotes','Partituras publicadas') + (files.length ?
    '<div class="card stack">' + field('query','Buscar por obra, instrumento o voz','type="search" autocomplete="off"') +
    '<div class="actions">' + button('Seleccionar visibles','secondary','type="button" id="select-visible"') +
    button('Limpiar selección','quiet','type="button" id="clear-selection"') + '</div>' +
    '<div class="row-list" id="download-options"></div><p class="muted" role="status" id="download-count"></p>' +
    '<div class="actions">' + button('Descargar ZIP','primary','type="button" id="download-selection"') + '</div></div>' :
    empty('No hay partituras disponibles para descargar.'));
  if (!files.length) return;
  const selected = new Set();
  const target = content.querySelector('#download-options');
  const query = content.querySelector('[name="query"]');
  const save = content.querySelector('#download-selection');
  const select = content.querySelector('#select-visible');
  const clear = content.querySelector('#clear-selection');
  const visible = () => files.filter(file => normalize([file.title,file.authors,file.name,file.instrument,file.voice].join(' '))
    .includes(normalize(query.value)));
  function status() {
    content.querySelector('#download-count').textContent = selected.size + (selected.size === 1 ? ' partitura seleccionada' : ' partituras seleccionadas');
    save.disabled = clear.disabled = selected.size === 0;
    select.disabled = !visible().some(file => !selected.has(file.id));
  }
  function draw() {
    const results = visible();
    target.innerHTML = results.length ? results.map(file => '<label class="row"><input type="checkbox" value="' + esc(file.id) +
      '"' + (selected.has(file.id) ? ' checked' : '') + '><span class="row-copy"><strong>' + esc(file.title) +
      '</strong><span>' + esc([file.instrument,file.voice,file.name].filter(Boolean).join(' · ')) + '</span></span></label>').join('') :
      empty('No hay partituras que coincidan con la búsqueda.');
    status();
  }
  target.onchange = ({target: box}) => {
    if (box.checked) selected.add(box.value);
    else selected.delete(box.value);
    status();
  };
  query.oninput = draw;
  select.onclick = () => { for (const file of visible()) selected.add(file.id); draw(); };
  clear.onclick = () => { selected.clear(); draw(); };
  save.onclick = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const controls = [query,select,clear,...target.querySelectorAll('input')];
    controls.forEach(control => { control.disabled = true; });
    await runDownload(save,ctx,ids);
    controls.forEach(control => { control.disabled = false; });
    status();
  };
  draw();
}

function scoreRow(file, ctx) {
  const { state } = ctx;
  const saved = state.saved.has(file.id);
  const status = file.archived ? 'Versión anterior' : !file.approved ? 'Pendiente de validación' :
    saved ? 'Guardada en este dispositivo' : 'Disponible en línea';
  const size = new Intl.NumberFormat('es-ES',{ maximumFractionDigits:1 }).format(file.bytes / 1024);
  return '<div class="score-row"><span class="tile">' + icon('file') + '</span><div class="row-copy"><strong>' +
    [file.instrument,file.voice].filter(Boolean).map(esc).join(' · ') + '</strong><span class="muted">PDF · ' + size + ' KB</span><div>' +
    pill(status, !file.approved ? 'waiting' : saved ? 'good' : file.archived ? '' : 'info') + '</div></div><div class="score-actions">' +
    (!state.offline ? '<a class="button quiet" href="/api/files/' + file.id + '" target="_blank" rel="noopener">' +
      icon('file') + 'Abrir PDF</a>' : '') +
    (saved ? button('Abrir PDF guardado','secondary','data-open="' + file.id + '"') +
      button('Exportar copia guardada','secondary','data-download="' + file.id + '"') :
      (!state.offline && file.approved && !file.archived ? button('Guardar sin conexión','secondary','data-save="' + file.id + '"') : '')) +
    (!file.approved && canManageScores(state) ?
      button('Validar distribución','secondary','data-approve="' + file.id + '"') +
      button('Descartar PDF','quiet','data-discard="' + file.id + '"') : '') +
    (state.offline && !saved ? '<span class="muted">Necesitas conexión.</span>' : '') + '</div></div>';
}

function validation(content,ctx) {
  const previous = back('Repertorio','#/repertorio');
  if (!canManageScores(ctx.state)) {
    content.innerHTML = previous + empty('Validar partituras requiere permisos de gestión y conexión.');
    return;
  }
  const works = ctx.state.data.works.map(work => ({ ...work, scores:work.scores.filter(file => !file.approved) }))
    .filter(work => work.scores.length);
  const files = works.flatMap(work => work.scores);
  content.innerHTML = previous + header('Validar partituras','Revisión de distribución','',
    files.length + (files.length === 1 ? ' PDF pendiente' : ' PDF pendientes')) + (files.length ? '<div class="stack">' + works.map(work =>
      '<section class="card stack">' + sectionTitle(work.title) + '<div class="row-list">' +
      work.scores.map(file => '<div class="validation-file"><p class="muted">' + esc(file.name) + '</p>' + scoreRow(file,ctx) + '</div>').join('') +
      '</div></section>').join('') + '</div>' : empty('No hay partituras pendientes de validación.'));
  bindScores(content,ctx,files,() => validation(content,ctx));
}

function workPage(content,ctx,id) {
  const { state } = ctx;
  const work = state.data.works.find(item => item.id === id);
  const previous = back('Repertorio','#/repertorio');
  if (!work) {
    content.innerHTML = previous + empty('Obra no encontrada.');
    return;
  }
  const mine = work.scores.filter(file => matchesScore(file,state.member));
  if (!canManage(state.member.role)) {
    content.innerHTML = previous + header(work.title,[work.authors,work.genre].filter(Boolean).join(' · ')) +
      '<div class="row-list">' + mine.map(file => scoreRow(file,ctx)).join('') + '</div>';
    bindScores(content,ctx,mine,() => workPage(content,ctx,id));
    return;
  }
  const current = work.scores.filter(file => !file.archived);
  const archived = work.scores.filter(file => file.archived);
  content.innerHTML = previous + header(work.title,[work.authors,work.genre].filter(Boolean).join(' · ')) +
    '<section>' + sectionTitle('Partituras') + (current.length ? '<div class="row-list">' + current.map(file =>
      '<div class="card stack"><p class="muted">' + esc(file.name) + '</p>' + scoreRow(file,ctx) +
      (canManageScores(state) && file.approved && !current.some(item => item.replaces_id === file.id) ?
        actionLink('Subir nueva versión','#/repertorio/reemplazo/' + file.id,'upload') : '') + '</div>').join('') + '</div>' :
      empty('Aún no hay partituras para esta obra.')) + '</section>' + (archived.length ?
      '<section>' + sectionTitle('Versiones anteriores') + '<div class="row-list">' + archived.map(file =>
        '<div class="card stack"><p class="muted">' + esc(file.name) + '</p>' + scoreRow(file,ctx) + '</div>').join('') + '</div></section>' : '');
  bindScores(content,ctx,work.scores,() => workPage(content,ctx,id));
}

function replacement(content,ctx,id) {
  const work = ctx.state.data.works.find(work => work.scores.some(file => file.id === id));
  const previous = back('Repertorio',work ? '#/repertorio/' + work.id : '#/repertorio');
  const file = work?.scores.find(file => file.id === id && file.approved && !file.archived);
  if (!canManageScores(ctx.state) || !file) {
    content.innerHTML = previous + empty('La partitura no está disponible para sustituir.');
    return;
  }
  content.innerHTML = previous + header('Subir nueva versión',work.title) + '<form class="card stack"><p>' +
    esc([file.name,file.instrument,file.voice].filter(Boolean).join(' · ')) + '</p>' +
    '<p class="muted">La versión actual seguirá disponible hasta que valides la nueva.</p>' +
    '<label>Nuevo PDF<input type="file" name="pdf" accept="application/pdf,.pdf" required></label>' + errorRegion +
    '<div class="actions">' + button('Guardar para validación') + '</div></form>';
  bindForm(content.querySelector('form'),async ({pdf}) => {
    await ctx.api('/files/' + file.id + '/replace','POST',{ name:pdf.name,content:await pdfContent(pdf) },30000);
    await ctx.refresh();
    ctx.toast('Nueva versión pendiente de validación');
    ctx.go('#/repertorio/validacion');
  });
}

function bindScores(content, ctx, files, draw) {
  for (const control of content.querySelectorAll('[data-save], [data-open], [data-download], [data-remove], [data-approve], [data-discard]')) {
    control.addEventListener('click', async () => {
      control.disabled = true;
      const { save, open, download, remove, approve, discard } = control.dataset;
      const file = files.find(item => item.id === (save ?? open ?? download ?? remove ?? approve ?? discard));
      const account = ctx.state.member.id;
      try {
        if (save) {
          await savePdf(account,file);
          if (ctx.state.member?.id !== account) return;
          ctx.state.saved.add(file.id);
          ctx.toast('Partitura guardada en este dispositivo');
          draw();
        } else if (open) {
          await openSavedPdf(account,file);
        } else if (download) {
          await downloadPdf(account,file);
        } else if (remove) {
          await removePdf(account,file);
          ctx.state.saved.delete(file.id);
          ctx.toast('Descarga retirada de Calvario');
          draw();
        } else if (approve && await ctx.confirmAction('¿Validar distribución?',
          'Publicar ' + file.name + ' para su instrumento y voz.' +
            (file.replaces_id ? ' La versión anterior pasará al historial.' : ''),'Validar')) {
          await ctx.api('/files/' + file.id + '/approve','PUT',{});
          await ctx.refresh();
          ctx.toast('Partitura publicada');
          draw();
        } else if (discard && await ctx.confirmAction('¿Descartar el PDF pendiente?',file.name,'Descartar')) {
          await ctx.api('/files/' + file.id,'DELETE',{});
          await ctx.refresh();
          ctx.toast('PDF descartado');
          draw();
        }
      } catch (error) {
        ctx.networkFailure(error);
        ctx.toast(error.message);
      } finally {
        control.disabled = false;
      }
    });
  }
}

export function downloads(content,ctx) {
  const files = ctx.state.data.works.flatMap(work => work.scores
    .filter(file => ctx.state.saved.has(file.id)).map(file => ({ ...file, title:work.title })));
  content.innerHTML = back('Perfil','#/perfil') + header('Descargas','Partituras guardadas en este dispositivo') +
    (files.length ? '<div class="row-list">' + files.map(file => '<div class="score-row"><span class="tile">' + icon('file') +
      '</span><div class="row-copy"><strong>' + esc(file.title) + '</strong><span class="muted">' +
      [file.instrument,file.voice].filter(Boolean).map(esc).join(' · ') + '</span></div><div class="score-actions">' +
      button('Abrir PDF guardado','secondary','data-open="' + file.id + '"') +
      button('Exportar copia guardada','secondary','data-download="' + file.id + '"') +
      button('Retirar descarga','secondary','data-remove="' + file.id + '"') + '</div></div>').join('') + '</div>' :
      empty('Todavía no tienes partituras guardadas.')) +
    '<p class="muted">Retirar una descarga libera espacio en Calvario. Las copias exportadas quedan en tu dispositivo.</p>';
  bindScores(content,ctx,files,() => downloads(content,ctx));
}

function archive(content,ctx) {
  const { state } = ctx;
  const previous = back('Repertorio','#/repertorio');
  if (!canManageScores(state)) {
    content.innerHTML = previous + empty('Cargar partituras requiere acceso de Dirección y conexión.');
    return;
  }
  const works = Object.fromEntries(state.data.works.map(work => [work.id,work.title]));
  const workFields = '<div class="stack">' + field('title','Título','required maxlength="150"') +
    field('authors','Autoría','required maxlength="250"') + field('genre','Género','maxlength="80" list="genre-options"') + '</div>';
  content.innerHTML = previous + header('Carga de partituras','Archivo musical') + '<div class="event-layout"><form id="work" class="card stack"><h2>Obras</h2>' +
    (Object.keys(works).length ? '<label>Obra<select name="existing"><option value="">Nueva obra</option>' +
      options(works) + '</select></label>' : '') + workFields +
    errorRegion + button('Crear obra','primary','id="save-work"') + '</form><section class="card stack"><h2>Cargar partituras</h2>' +
    (Object.keys(works).length ? '<label class="upload-zone" id="batch-drop">' + icon('upload') +
      '<strong>Seleccionar o arrastrar archivos PDF</strong><span class="muted">Hasta 20 archivos por lote · 5 MB por PDF</span>' +
      '<input type="file" id="batch" multiple accept="application/pdf,.pdf"></label>' +
      '<div id="file-forms" class="stack"><p class="muted">Los PDF quedan pendientes de validación.</p></div>' :
      '<p class="muted">Crea una obra antes de cargar partituras.</p>') + '</section></div>' + optionLists(state.data.catalogValues);
  const workForm = content.querySelector('#work');
  function chooseWork() {
    const chosen = state.data.works.find(work => work.id === workForm.elements.existing?.value);
    for (const key of ['title','authors','genre']) workForm.elements[key].value = chosen?.[key] ?? '';
    workForm.querySelector('#save-work').textContent = chosen ? 'Guardar datos de la obra' : 'Crear obra';
  }
  if (workForm.elements.existing) workForm.elements.existing.onchange = chooseWork;
  bindForm(workForm,async ({existing,title,authors,genre}) => {
    if (content.querySelector('#batch')?.disabled) throw new Error('Espera a que termine la carga de PDF.');
    const batchRoot = content.querySelector('#file-forms');
    if (batchRoot?.querySelector('form:not([data-saved])') && !await ctx.confirmAction('¿Guardar la obra?',
      'Para actualizar el catálogo se cerrará el lote de PDF que todavía no has guardado.','Guardar obra')) return;
    await ctx.api('/works' + (existing ? '/' + existing : ''), existing ? 'PUT' : 'POST', { title,authors,genre });
    await ctx.refresh();
    ctx.toast(existing ? 'Datos de la obra actualizados' : 'Obra creada');
    archive(content,ctx);
  });
  const batch = content.querySelector('#batch');
  if (!batch) return;
  const forms = content.querySelector('#file-forms');
  const drop = content.querySelector('#batch-drop');
  drop.ondragover = event => { event.preventDefault(); if (!batch.disabled) drop.classList.add('dragging'); };
  drop.ondragleave = event => { if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging'); };
  drop.ondrop = event => {
    event.preventDefault();
    drop.classList.remove('dragging');
    if (!batch.disabled && event.dataTransfer.files.length) { batch.value = ''; draw([...event.dataTransfer.files]); }
  };
  batch.onchange = () => draw([...batch.files]);
  function draw(files) {
    if (files.length > 20) {
      batch.value = '';
      forms.innerHTML = '<p role="alert">Selecciona hasta 20 PDF por lote.</p>';
      return;
    }
    forms.innerHTML = (files.length ? '<p class="muted">' + files.length + ' PDF en el lote</p>' : '') +
      files.map((file,i) => '<form data-index="' + i + '" class="batch-form stack"><div class="member-heading"><span class="tile">' +
      icon('file') + '</span><h3>' + esc(file.name) + '</h3></div><label>Obra<select name="work" required><option value="">Elige una obra</option>' + options(works) +
      '</select></label><div class="field-grid">' + field('instrument','Instrumento','required maxlength="80" list="instrument-options"') +
      field('voice','Voz','maxlength="80" list="voice-options"') + '</div>' + errorRegion +
      button('Guardar para validación','secondary') + '</form>').join('') +
      (files.length > 1 ? button('Guardar lote','primary','id="save-batch"') : '');
    async function upload(input,form) {
      const file = files[Number(form.dataset.index)];
      const payload = { name:file.name, instrument:input.instrument, voice:input.voice, content:await pdfContent(file) };
      await ctx.api('/works/' + input.work + '/scores','POST',payload,30000);
      form.dataset.saved = 'true';
      form.innerHTML = '<h3>' + esc(file.name) + '</h3>' + pill('Pendiente de validación','good');
    }
    for (const form of forms.querySelectorAll('form')) bindForm(form,async input => {
      if (batch.disabled) return;
      batch.disabled = true;
      try {
        await upload(input,form);
        await ctx.refresh();
      } catch (error) {
        ctx.networkFailure(error);
        throw error;
      } finally {
        batch.disabled = false;
      }
    });
    const saveBatch = forms.querySelector('#save-batch');
    if (saveBatch) saveBatch.onclick = async () => {
      if (batch.disabled) return;
      const pending = [...forms.querySelectorAll('form:not([data-saved])')];
      if (!pending.length) return;
      batch.disabled = true;
      saveBatch.disabled = true;
      for (const control of forms.querySelectorAll('form button')) control.disabled = true;
      let saved = 0;
      try {
        for (const form of pending) {
          const errorRegion = form.querySelector('.form-error');
          errorRegion.hidden = true;
          if (!form.checkValidity()) {
            errorRegion.textContent = 'Indica la obra y el instrumento.';
            errorRegion.hidden = false;
            continue;
          }
          try {
            await upload(Object.fromEntries(new FormData(form)),form);
            saved++;
          } catch (error) {
            errorRegion.textContent = error.message;
            errorRegion.hidden = false;
            ctx.networkFailure(error);
            if (error.status === 401 || error.code === 'inactive' || error.code === 'account_changed') break;
          }
        }
        ctx.toast(saved + ' PDF guardados para validación · ' + (pending.length - saved) + ' pendientes en el lote');
        if (saved) await ctx.refresh();
      } catch (error) {
        ctx.networkFailure(error);
        ctx.toast(error.message);
      } finally {
        batch.disabled = false;
        saveBatch.disabled = false;
        for (const control of forms.querySelectorAll('form button')) control.disabled = false;
      }
    };
  }
}
