import { back, bindForm, button, empty, errorRegion, esc, field, header, icon, link, matchesScore, normalize,
  options, pill, row, sectionTitle, segment } from './ui.js';
import { downloadPdf, openSavedPdf, removePdf, savePdf } from './storage.js';
import { pdfContent } from './management.js';

let scope = 'mine';
let query = '';

export function repertoire(content, ctx, id) {
  if (id === 'archivo') return archive(content,ctx);
  if (id) return workPage(content,ctx,id);
  const { state } = ctx;
  content.innerHTML = header('Repertorio','La música de la banda',
    state.member.role === 'admin' && !state.offline ? link('Gestionar archivo','#/repertorio/archivo') : '') +
    '<div class="catalog-tools">' + field('query','Buscar por título o autor','type="search" autocomplete="off"',query) +
    segment('Partituras',[['mine','Mis partituras'],['all','Todas']],scope) + '</div><div id="works" class="row-list"></div>';
  const search = content.querySelector('input');
  const tabs = content.querySelector('.segments');
  const list = content.querySelector('#works');
  const visible = () => state.data.works.filter(work => (scope === 'all' ?
    work.scores.some(file => file.approved || state.member.role === 'director') :
    work.scores.some(file => matchesScore(file,state.member))) &&
    normalize(work.title + ' ' + work.authors + ' ' + work.genre).includes(normalize(query)));

  function show() {
    const works = visible();
    list.innerHTML = works.length ? works.map(work => row(work.title,
      [work.authors,work.genre].filter(Boolean).join(' · '),'#/repertorio/' + work.id,'file')).join('') :
      empty(query ? 'No hay obras que coincidan con la búsqueda.' :
        scope === 'mine' ? 'Aún no hay partituras para tu instrumento y voz.' : 'El catálogo aún no tiene partituras disponibles.');
  }

  search.oninput = () => { query = search.value; show(); };
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
    [file.instrument,file.voice].filter(Boolean).map(esc).join(' · ') + '</strong><span class="muted">PDF · ' + size + ' KB · ' + status +
    '</span></div><div class="score-actions">' +
    (!state.offline ? '<a class="text-link" href="/api/files/' + file.id + '" target="_blank" rel="noopener">Abrir PDF</a>' : '') +
    (saved ? button('Abrir PDF guardado','secondary','data-open="' + file.id + '"') +
      button('Exportar copia guardada','secondary','data-download="' + file.id + '"') :
      (!state.offline && file.approved ? button('Guardar sin conexión','secondary','data-save="' + file.id + '"') : '')) +
    (!file.approved && state.member.role === 'director' && !state.offline ?
      button('Validar distribución','secondary','data-approve="' + file.id + '"') : '') +
    (state.offline && !saved ? '<span class="muted">Necesitas conexión.</span>' : '') + '</div></div>';
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
  if (state.member.role !== 'admin' || state.offline) {
    content.innerHTML = previous + empty('La carga del archivo requiere acceso de administración y conexión.');
    return;
  }
  const works = Object.fromEntries(state.data.works.map(work => [work.id,work.title]));
  content.innerHTML = previous + header('Archivo musical') + '<div class="event-layout"><form id="work" class="card stack">' +
    '<h2>Nueva obra</h2>' + field('title','Título','required maxlength="150"') +
    field('authors','Autoría','required maxlength="250"') + field('genre','Género','maxlength="80"') +
    errorRegion + button('Crear obra') + '</form><section class="card stack"><h2>Cargar partituras</h2>' +
    (Object.keys(works).length ? '<label>Seleccionar archivos PDF<input type="file" id="batch" multiple accept="application/pdf,.pdf"></label>' +
      '<div id="file-forms" class="stack"><p class="muted">Los PDF quedan pendientes de validación de dirección.</p></div>' :
      '<p class="muted">Crea una obra antes de cargar partituras.</p>') + '</section></div>';
  bindForm(content.querySelector('#work'),async input => {
    await ctx.api('/works','POST',input);
    await ctx.refresh();
    ctx.toast('Obra creada');
    archive(content,ctx);
  });
  const batch = content.querySelector('#batch');
  if (!batch) return;
  const forms = content.querySelector('#file-forms');
  batch.onchange = () => {
    const files = [...batch.files];
    if (files.length > 20) {
      batch.value = '';
      forms.innerHTML = '<p role="alert">Selecciona hasta 20 PDF por lote.</p>';
      return;
    }
    forms.innerHTML = files.map((file,i) => '<form data-index="' + i + '" class="batch-form stack"><h3>' + esc(file.name) +
      '</h3><label>Obra<select name="work" required><option value="">Elige una obra</option>' + options(works) +
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
  };
}
