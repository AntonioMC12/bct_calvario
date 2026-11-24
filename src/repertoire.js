import { back, bindForm, button, empty, errorRegion, esc, field, header, icon, instrument, link, matchesScore, normalize,
  options, pill, row, sectionTitle, segment } from './ui.js';
import { downloadPdf, openSavedPdf, removePdf, savePdf } from './storage.js';
import { pdfContent } from './management.js';

let scope = 'mine';
let query = '';
let genre = '';
const canUploadScores = state => !state.offline && ['admin','director'].includes(state.member.role);

export function repertoire(content, ctx, id) {
  if (id === 'archivo') return archive(content,ctx);
  if (id === 'validacion') return validation(content,ctx);
  if (id) return workPage(content,ctx,id);
  const { state } = ctx;
  const genres = [...new Set(state.data.works.map(work => work.genre).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es'));
  if (!genres.includes(genre)) genre = '';
  const tools = canUploadScores(state) ? '<div class="actions">' + link('Cargar partituras','#/repertorio/archivo') +
    (state.member.role === 'director' ? link('Validar partituras','#/repertorio/validacion') : '') + '</div>' : '';
  content.innerHTML = header('Repertorio','Partituras de la banda',tools) +
    '<div class="card stack catalog-panel"><div class="field-grid">' + field('query','Buscar por título o autor','type="search" autocomplete="off"',query) +
    '<label>Género<select name="genre"><option value="">Todos los géneros</option>' +
    options(Object.fromEntries(genres.map(value => [value,value])),genre) + '</select></label></div>' +
    segment('Partituras',[['mine','Mis partituras','repertorio'],['all','Todas','list']],scope) +
    '<p id="catalog-part" class="muted"></p></div><div id="works" class="stack"></div>';
  const search = content.querySelector('input');
  const genreControl = content.querySelector('[name="genre"]');
  const tabs = content.querySelector('.segments');
  const list = content.querySelector('#works');
  const visible = () => state.data.works.filter(work => (scope === 'all' ?
    work.scores.some(file => file.approved || state.member.role === 'director') :
    work.scores.some(file => matchesScore(file,state.member))) &&
    (!genre || genre === work.genre) && normalize(work.title + ' ' + work.authors + ' ' + work.genre).includes(normalize(query)));

  function show() {
    const works = visible();
    const part = instrument(state.member);
    const scopeHint = content.querySelector('#catalog-part');
    scopeHint.hidden = scope !== 'mine' || !part;
    scopeHint.innerHTML = part ? 'Tu instrumento y voz · ' + part : '';
    list.innerHTML = works.length ? [...Map.groupBy(works,work => work.genre || 'Sin género')].map(([group,items]) =>
      '<section class="stack catalog-group">' + sectionTitle(group) + '<div class="catalog-grid">' + items.map(work => {
        const preferred = work.scores.find(file => matchesScore(file,state.member));
        const file = preferred ?? (scope === 'all' ? work.scores[0] : undefined);
        return '<article class="card stack catalog-work"><div class="member-heading"><span class="tile">' + icon('repertorio') +
          '</span><div><h3>' + esc(work.title) + '</h3><p class="muted">' + esc(work.authors) + '</p></div></div>' +
          (file ? scoreRow(file,ctx) : '') + '<a class="button quiet event-action" href="#/repertorio/' + esc(work.id) +
          '">Ver obra y voces' + icon('right') + '</a></article>';
      }).join('') + '</div></section>').join('') :
      empty(query || genre ? 'No hay obras que coincidan con la búsqueda.' :
        scope === 'mine' ? 'Aún no hay partituras para tu instrumento y voz.' : 'El catálogo aún no tiene partituras disponibles.');
    bindScores(list,ctx,works.flatMap(work => work.scores),show);
  }

  search.oninput = () => { query = search.value; show(); };
  genreControl.onchange = () => { genre = genreControl.value; show(); };
  tabs.onclick = event => {
    const selected = event.target.closest('button');
    if (!selected) return;
    scope = selected.dataset.value;
    for (const control of tabs.querySelectorAll('button')) control.setAttribute('aria-pressed',String(control === selected));
    show();
  };
  show();
}

function scoreRow(file, ctx) {
  const { state } = ctx;
  const saved = state.saved.has(file.id);
  const status = !file.approved ? 'Pendiente de validación' : saved ? 'Guardada en este dispositivo' : 'Disponible en línea';
  const size = new Intl.NumberFormat('es-ES',{ maximumFractionDigits:1 }).format(file.bytes / 1024);
  return '<div class="score-row"><span class="tile">' + icon('file') + '</span><div class="row-copy"><strong>' +
    [file.instrument,file.voice].filter(Boolean).map(esc).join(' · ') + '</strong><span class="muted">PDF · ' + size + ' KB</span><div>' +
    pill(status, !file.approved ? 'waiting' : saved ? 'good' : '') + '</div></div><div class="score-actions">' +
    (!state.offline ? '<a class="text-link" href="/api/files/' + file.id + '" target="_blank" rel="noopener">Abrir PDF</a>' : '') +
    (saved ? button('Abrir PDF guardado','secondary','data-open="' + file.id + '"') +
      button('Exportar copia guardada','secondary','data-download="' + file.id + '"') :
      (!state.offline && file.approved ? button('Guardar sin conexión','secondary','data-save="' + file.id + '"') : '')) +
    (!file.approved && state.member.role === 'director' && !state.offline ?
      button('Validar distribución','secondary','data-approve="' + file.id + '"') : '') +
    (state.offline && !saved ? '<span class="muted">Necesitas conexión.</span>' : '') + '</div></div>';
}

function validation(content,ctx) {
  const previous = back('Repertorio','#/repertorio');
  if (ctx.state.member.role !== 'director' || ctx.state.offline) {
    content.innerHTML = previous + empty('Solo dirección puede validar partituras con conexión.');
    return;
  }
  const works = ctx.state.data.works.map(work => ({ ...work, scores:work.scores.filter(file => !file.approved) }))
    .filter(work => work.scores.length);
  const files = works.flatMap(work => work.scores);
  content.innerHTML = previous + header('Validar partituras','Revisión de distribución por dirección','',
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
  const others = work.scores.filter(file => !mine.includes(file));
  content.innerHTML = previous + header(work.title,[work.authors,work.genre].filter(Boolean).join(' · ')) +
    (mine.length ? '<section>' + sectionTitle('Tus partituras') + '<div class="row-list">' +
      mine.map(file => scoreRow(file,ctx)).join('') + '</div></section>' : '') +
    '<section>' + sectionTitle(mine.length ? 'Otras partituras' : 'Partituras') +
    (others.length ? '<div class="row-list">' + others.map(file => scoreRow(file,ctx)).join('') + '</div>' :
      empty(mine.length ? 'No hay otras voces disponibles.' : 'Aún no hay partituras para esta obra.')) + '</section>';
  bindScores(content,ctx,work.scores,() => workPage(content,ctx,id));
}

function bindScores(content, ctx, files, draw) {
  for (const control of content.querySelectorAll('[data-save], [data-open], [data-download], [data-remove], [data-approve]')) {
    control.addEventListener('click', async () => {
      control.disabled = true;
      const { save, open, download, remove, approve } = control.dataset;
      const file = files.find(item => item.id === (save ?? open ?? download ?? remove ?? approve));
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
          'Confirma que la banda puede distribuir ' + file.name + ' entre los miembros activos.','Validar')) {
          await ctx.api('/files/' + file.id + '/approve','PUT',{});
          await ctx.refresh();
          ctx.toast('Partitura disponible para la banda');
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
  if (!canUploadScores(state)) {
    content.innerHTML = previous + empty('Administración y dirección pueden cargar partituras con conexión.');
    return;
  }
  const canEditWorks = state.member.role === 'admin';
  const works = Object.fromEntries(state.data.works.map(work => [work.id,work.title]));
  const workFields = '<div class="stack">' + field('title','Título','required maxlength="150"') +
    field('authors','Autoría','required maxlength="250"') + field('genre','Género','maxlength="80"') + '</div>';
  content.innerHTML = previous + header('Carga de partituras','Archivo musical') + '<div class="event-layout"><form id="work" class="card stack">' +
    (canEditWorks ? '<h2>Obras</h2>' : '<h2>Nueva obra</h2>') +
    (canEditWorks && Object.keys(works).length ? '<label>Obra<select name="existing"><option value="">Nueva obra</option>' +
      options(works) + '</select></label>' : '') + workFields +
    errorRegion + button('Crear obra','primary','id="save-work"') + '</form><section class="card stack"><h2>Cargar partituras</h2>' +
    (Object.keys(works).length ? '<label class="upload-zone" id="batch-drop">' + icon('upload') +
      '<strong>Seleccionar o arrastrar archivos PDF</strong><span class="muted">Hasta 20 archivos por lote · 5 MB por PDF</span>' +
      '<input type="file" id="batch" multiple accept="application/pdf,.pdf"></label>' +
      '<div id="file-forms" class="stack"><p class="muted">Los PDF quedan pendientes de validación de dirección.</p></div>' :
      '<p class="muted">Crea una obra antes de cargar partituras.</p>') + '</section></div>';
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
      '</select></label><div class="field-grid">' + field('instrument','Instrumento','required maxlength="80"') +
      field('voice','Voz','maxlength="80"') + '</div>' + errorRegion +
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
