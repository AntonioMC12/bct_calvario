import { back, bindForm, button, empty, errorRegion, esc, field, header, options, sectionTitle } from './ui.js';
import { canManage } from './roles.js';

const kinds = { instrument:'Instrumentos', voice:'Voces', genre:'Géneros' };

export function optionLists(values = []) {
  return Object.keys(kinds).map(kind => '<datalist id="' + kind + '-options">' +
    values.filter(value => value.kind === kind).map(value => '<option value="' + esc(value.label) + '"></option>').join('') +
    '</datalist>').join('');
}

export function catalogPage(content,ctx) {
  const previous = back('Gestión','#/gestion');
  if (ctx.state.offline || !canManage(ctx.state.member.role)) {
    content.innerHTML = previous + empty('Gestionar el catálogo requiere acceso de Dirección y conexión.');
    return;
  }
  const values = ctx.state.data.catalogValues ?? [];
  content.innerHTML = previous + header('Catálogo musical','Define los instrumentos de la banda y las voces o partes de cada uno.') +
    '<form id="catalog-value" class="card stack"><div class="field-grid"><label>Tipo<select name="kind">' + options(kinds) +
    '</select></label><label data-catalog-instrument hidden>Instrumento<select name="instrument">' +
      '<option value="">Elige un instrumento</option>' + values.filter(value => value.kind === 'instrument').map(value =>
        '<option value="' + esc(value.label) + '">' + esc(value.label) + '</option>').join('') + '</select></label>' + field('label','Nombre','required maxlength="80"') + '</div>' + errorRegion +
    '<div class="actions">' + button('Añadir al catálogo') + '</div></form>' +
    Object.entries(kinds).map(([kind,title]) => {
      const entries = values.filter(item => item.kind === kind);
      return '<section>' + sectionTitle(title) + (entries.length ? '<div class="row-list">' + entries.map(entry =>
        '<form class="row" data-option="' + esc(entry.id) + '"><div class="row-copy"><strong>' + esc(entry.label) + (entry.instrument ? ' · ' + esc(entry.instrument) : entry.kind === 'voice' ? ' · Sin instrumento asignado' : '') +
        '</strong>' + errorRegion + '</div>' + button('Retirar del catálogo','quiet') + '</form>').join('') +
        '</div>' : empty('Todavía no hay valores.')) + '</section>';
    }).join('');
  const catalogForm = content.querySelector('#catalog-value');
  catalogForm.elements.kind.addEventListener('change',() => {
    const voice = catalogForm.elements.kind.value === 'voice';
    catalogForm.querySelector('[data-catalog-instrument]').hidden = !voice;
    catalogForm.elements.instrument.required = voice;
  });
  bindForm(catalogForm,async input => {
    await ctx.api('/catalog-values','POST',input);
    await ctx.refresh();
    ctx.toast('Valor añadido al catálogo');
    catalogPage(content,ctx);
  });
  for (const form of content.querySelectorAll('[data-option]')) bindForm(form,async () => {
    await ctx.api('/catalog-values/' + form.dataset.option,'DELETE',{});
    await ctx.refresh();
    ctx.toast('Valor retirado');
    catalogPage(content,ctx);
  });
}

export function musicalFields(values = [], member = null) {
  const instruments = values.filter(value => value.kind === 'instrument');
  if (!instruments.length) return field('instrument','Instrumento','required maxlength="80"',member?.instrument) +
    field('voice','Voz / parte (si la hubiera)','maxlength="80"',member?.voice);
  if (member?.instrument && !instruments.some(value => value.label === member.instrument)) {
    instruments.push({ label:member.instrument });
  }
  return '<label>Instrumento<select name="instrument" required><option value="">Elige un instrumento</option>' +
    instruments.map(value => '<option value="' + esc(value.label) + '"' + (value.label === member?.instrument ? ' selected' : '') + '>' + esc(value.label) + '</option>').join('') +
    '</select></label><label data-musical-voice hidden>Voz / parte<select name="voice"></select></label>';
}

export function bindMusicalFields(form, values = [], member = null) {
  const group = form?.querySelector('[data-musical-voice]');
  if (!group) return;
  const update = () => {
    const voices = values.filter(value => value.kind === 'voice' && value.instrument === form.elements.instrument.value);
    const select = form.elements.voice;
    select.innerHTML = '<option value="">Elige una voz / parte</option>' + voices.map(value =>
      '<option value="' + esc(value.label) + '">' + esc(value.label) + '</option>').join('');
    group.hidden = !voices.length;
    select.required = !!voices.length;
    select.disabled = !voices.length;
  };
  form.elements.instrument.addEventListener('change',update);
  update();
  if (member?.voice) {
    const select = form.elements.voice;
    if (!Array.from(select.options).some(option => option.value === member.voice)) {
      select.insertAdjacentHTML('beforeend','<option value="' + esc(member.voice) + '">' + esc(member.voice) + ' (actual)</option>');
    }
    select.disabled = false;
    group.hidden = false;
    select.value = member.voice;
  }
}
