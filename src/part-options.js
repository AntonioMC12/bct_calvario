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
  content.innerHTML = previous + header('Catálogo musical','Instrumentos, voces y géneros') +
    '<form id="catalog-value" class="card stack"><div class="field-grid"><label>Tipo<select name="kind">' + options(kinds) +
    '</select></label>' + field('label','Nombre','required maxlength="80"') + '</div>' + errorRegion +
    '<div class="actions">' + button('Añadir al catálogo') + '</div></form>' +
    Object.entries(kinds).map(([kind,title]) => {
      const entries = values.filter(item => item.kind === kind);
      return '<section>' + sectionTitle(title) + (entries.length ? '<div class="row-list">' + entries.map(entry =>
        '<form class="row" data-option="' + esc(entry.id) + '"><div class="row-copy"><strong>' + esc(entry.label) +
        '</strong>' + errorRegion + '</div>' + button('Retirar sugerencia','quiet') + '</form>').join('') +
        '</div>' : empty('Todavía no hay valores.')) + '</section>';
    }).join('');
  bindForm(content.querySelector('#catalog-value'),async input => {
    await ctx.api('/catalog-values','POST',input);
    await ctx.refresh();
    ctx.toast('Valor añadido al catálogo');
    catalogPage(content,ctx);
  });
  for (const form of content.querySelectorAll('[data-option]')) bindForm(form,async () => {
    await ctx.api('/catalog-values/' + form.dataset.option,'DELETE',{});
    await ctx.refresh();
    ctx.toast('Sugerencia retirada');
    catalogPage(content,ctx);
  });
}
