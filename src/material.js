import { back, bindForm, button, displayTime, empty, errorRegion, esc, field, header, icon, link, normalize,
  options, pill, sectionTitle, area } from './ui.js';
import { canManage } from './roles.js';

const root = '#/gestion/material';
const conditions = { usable:'En buen estado', repair:'En reparación', unusable:'Fuera de servicio' };

function availability(item, loan) {
  if (item.archived) return pill('Archivado');
  if (loan) return pill('Prestado','waiting');
  return item.condition === 'usable' ? pill('Disponible','good') : pill(conditions[item.condition],'waiting');
}

export async function materialPage(content, ctx, id) {
  const previous = back('Gestión','#/gestion');
  if (ctx.state.offline || !canManage(ctx.state.member.role)) {
    content.innerHTML = previous + empty('Gestionar material requiere acceso de Dirección y conexión.');
    return;
  }
  if (id === 'nuevo') return editMaterial(content,ctx);
  content.innerHTML = previous + header('Material') + '<p role="status">Cargando…</p>';
  const { items, loans, members } = await ctx.api('/material');
  const history = Map.groupBy(loans,loan => loan.item_id);
  if (id) {
    const item = items.find(item => item.id === id);
    if (item) return editMaterial(content,ctx,item,history.get(id) ?? [],members);
    content.innerHTML = back('Material',root) + empty('No se encuentra el material.');
    return;
  }
  content.innerHTML = previous + header('Material','Inventario y préstamos',
    '<a class="button primary" href="' + root + '/nuevo">' + icon('plus') + 'Añadir material</a>') +
    '<div class="catalog-tools field-grid">' + field('query','Buscar por nombre, código o categoría','type="search"') +
    '<label>Disponibilidad<select name="status">' + options({ current:'En inventario', available:'Disponibles',
      loaned:'Prestados', archived:'Archivados', all:'Todos' }) + '</select></label></div><div class="stack" id="inventory"></div>';
  const target = content.querySelector('#inventory');
  const query = content.querySelector('[name="query"]');
  const status = content.querySelector('[name="status"]');
  function draw() {
    const term = normalize(query.value);
    const visible = items.filter(item => {
      if (!normalize([item.name,item.code,item.category].join(' ')).includes(term)) return false;
      const loan = history.get(item.id)?.some(loan => !loan.returned_at);
      if (status.value === 'all') return true;
      if (status.value === 'archived') return Boolean(item.archived);
      if (item.archived) return false;
      if (status.value === 'available') return !loan && item.condition === 'usable';
      if (status.value === 'loaned') return loan;
      return true;
    });
    target.innerHTML = visible.length ? visible.map(item => {
      const loan = history.get(item.id)?.find(loan => !loan.returned_at);
      return '<article class="card member-card"><div class="member-heading"><span class="tile">' + icon('grid') +
        '</span><div><h2>' + esc(item.name) + '</h2><p class="muted">' + esc(item.code + ' · ' + item.category) + '</p>' +
        availability(item,loan) + (loan ? '<p>' + esc(loan.member_name) + '</p>' : '') + '</div></div>' +
        link('Ver ficha',root + '/' + item.id) + '</article>';
    }).join('') : empty('No hay material con esos filtros.');
  }
  query.oninput = status.onchange = draw;
  draw();
}

function editMaterial(content, ctx, item, history = [], members = []) {
  const loan = history.find(entry => !entry.returned_at);
  const endpoint = '/material' + (item ? '/' + item.id : '');
  content.innerHTML = back('Material',root) + header(item?.name ?? 'Añadir material',item?.code ?? '') +
    '<form id="material-form" class="card stack"><div class="field-grid">' +
    field('name','Nombre','required maxlength="120"',item?.name) + field('code','Código','required maxlength="40"',item?.code) +
    field('category','Categoría','required maxlength="80"',item?.category) +
    '<label>Estado<select name="condition">' + options(conditions,item?.condition) + '</select></label></div>' +
    area('notes','Notas','maxlength="1200" rows="3"',item?.notes) + errorRegion +
    '<div class="actions">' + button(item ? 'Guardar cambios' : 'Añadir material') + '</div></form>';
  bindForm(content.querySelector('#material-form'),async input => {
    const { id } = await ctx.api(endpoint,item ? 'PUT' : 'POST',{ ...input,version:item?.version });
    ctx.toast(item ? 'Ficha actualizada' : 'Material añadido');
    ctx.go(root + '/' + id);
  });
  if (!item) return;
  const memberOptions = Object.fromEntries(members.map(member => [member.id,[member.name,member.instrument].filter(Boolean).join(' · ')]));
  const title = loan ? 'Préstamo a ' + loan.member_name : 'Préstamos';
  const loanForm = loan ? '<form data-action="return" class="stack"><p>Desde el ' + displayTime(loan.lent_at) + '</p>' +
    errorRegion + '<div class="actions">' + button('Registrar devolución') + '</div></form>' :
    !item.archived && item.condition === 'usable' && members.length ?
      '<form data-action="loan" class="stack"><label>Miembro<select name="memberId" required>' +
      '<option value="">Selecciona un miembro</option>' + options(memberOptions) + '</select></label>' + errorRegion +
      '<div class="actions">' + button('Registrar préstamo') + '</div></form>' : '';
  const archiveForm = loan ? '' : '<form data-action="' + (item.archived ? 'restore' : 'archive') + '" class="stack">' + errorRegion +
    '<div class="actions">' + button(item.archived ? 'Restaurar al inventario' : 'Archivar material','secondary') + '</div></form>';
  content.insertAdjacentHTML('beforeend','<section class="card stack">' + sectionTitle(title) + '<p>' + availability(item,loan) + '</p>' +
    loanForm + archiveForm + '</section><section>' + sectionTitle('Historial de préstamos') + (history.length ? '<div class="row-list">' +
    history.map(entry => '<div class="row"><div class="row-copy"><strong>' + esc(entry.member_name) + '</strong><span>' +
      displayTime(entry.lent_at) + ' · ' + (entry.returned_at ? 'Devuelto el ' + displayTime(entry.returned_at) : 'Prestado') +
      '</span></div></div>').join('') + '</div>' : empty('Aún no hay préstamos.')) + '</section>');
  const messages = { loan:'Préstamo registrado', return:'Devolución registrada', archive:'Material archivado', restore:'Material restaurado' };
  for (const form of content.querySelectorAll('[data-action]')) bindForm(form,async input => {
    const action = form.dataset.action;
    if (action === 'archive' && !await ctx.confirmAction('¿Archivar material?',item.name,'Archivar')) return;
    await ctx.api(endpoint + '/' + action,'POST',{ ...input,version:item.version });
    ctx.toast(messages[action]);
    ctx.go(root + '/' + item.id);
  });
}
