import { actionLink, back, bindForm, button, displayTime, empty, errorRegion, esc, field, header, icon, normalize,
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
  const { items, loans, members, requests } = await ctx.api('/material');
  const history = Map.groupBy(loans,loan => loan.item_id);
  if (id) {
    const item = items.find(item => item.id === id);
    if (item) return editMaterial(content,ctx,item,history.get(id) ?? [],members);
    content.innerHTML = back('Material',root) + empty('No se encuentra el material.');
    return;
  }
  content.innerHTML = previous + header('Material','Inventario y préstamos',
    '<a class="button primary" href="' + root + '/nuevo">' + icon('plus') + 'Añadir material</a>') +
    requestQueue(requests,items,loans) + '<div class="catalog-tools field-grid">' + field('query','Buscar por nombre, código o categoría','type="search"') +
    '<label>Disponibilidad<select name="status">' + options({ current:'En inventario', available:'Disponibles',
      loaned:'Prestados', archived:'Archivados', all:'Todos' }) + '</select></label></div><div class="stack" id="inventory"></div>';
  for (const form of content.querySelectorAll('[data-review-request]')) {
    form.addEventListener('submit',event => { form.dataset.choice = event.submitter?.dataset.choice; });
    bindForm(form,async () => {
      const action = form.dataset.choice;
      if (!action) return;
      await ctx.api('/material-requests/' + form.dataset.reviewRequest + '/' + action,'POST',{});
      ctx.toast(action === 'approve' ? 'Solicitud aprobada y préstamo registrado' : 'Solicitud rechazada');
      await materialPage(content,ctx);
    });
  }
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
        actionLink('Ver ficha',root + '/' + item.id) + '</article>';
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

function requestQueue(requests, items, loans) {
  return '<section class="stack">' + sectionTitle('Solicitudes de material',requests.length + (requests.length === 1 ? ' pendiente' : ' pendientes')) +
    (requests.length ? requests.map(request => {
      const item = items.find(item => item.id === request.item_id);
      const available = item && request.member_status === 'active' && items.some(unit => unit.name === item.name &&
        unit.category === item.category && !unit.archived && unit.condition === 'usable' &&
        !loans.some(loan => loan.item_id === unit.id && !loan.returned_at));
      return '<form class="card stack" data-review-request="' + esc(request.id) + '"><h3>' + esc(request.item_name) +
        '</h3><p>' + esc(request.member_name + ' · ' + request.item_code) + '</p><p class="muted">' +
        displayTime(request.created_at) + (available ? '' : ' · Material o solicitante no disponible') + '</p>' + errorRegion +
        '<div class="actions">' + button('Aprobar y prestar','primary','data-choice="approve"' + (available ? '' : ' disabled')) +
        button('Rechazar','secondary','data-choice="reject"') + '</div></form>';
    }).join('') : empty('No hay solicitudes pendientes.')) + '</section>';
}

const requestStatuses = { pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada' };

export async function myMaterialPage(content, ctx) {
  const previous = back('Perfil','#/perfil');
  if (ctx.state.offline) {
    content.innerHTML = previous + header('Mi material') + empty('Necesitas conexión para consultar o solicitar material.');
    return;
  }
  content.innerHTML = previous + header('Mi material') + '<p role="status">Cargando…</p>';
  const { items, requests, loans } = await ctx.api('/my-material');
  const current = loans.filter(loan => !loan.returned_at);
  const returned = loans.filter(loan => loan.returned_at);
  const loanRows = entries => entries.map(loan => '<article class="card stack"><h3>' + esc(loan.item_name) +
    '</h3><p class="muted">' + esc(loan.item_code) + ' · Desde el ' + displayTime(loan.lent_at) + '</p>' +
    (loan.returned_at ? '<p>Devuelto el ' + displayTime(loan.returned_at) + '</p>' : pill('En préstamo','waiting')) + '</article>').join('');
  content.innerHTML = previous + header('Mi material','Solicita material de la banda y consulta tus préstamos.',
    button('Pedir material','primary','type="button" id="ask-material"')) +
    '<p class="muted">Cada solicitud es para una unidad. El préstamo se confirma cuando Dirección o Administración la aprueba.</p>' +
    '<section class="stack">' + sectionTitle('Mis solicitudes') + (requests.length ? requests.map(request =>
      '<article class="card stack"><h3>' + esc(request.item_name) + '</h3><p class="muted">' + esc(request.item_code) +
      ' · ' + displayTime(request.created_at) + '</p>' + pill(requestStatuses[request.status],request.status === 'pending' ? 'waiting' : '') +
      (request.status === 'pending' ? '<form data-cancel-request="' + esc(request.id) + '">' + errorRegion +
        button('Cancelar solicitud','secondary') + '</form>' : '') + '</article>').join('') : empty('Todavía no has solicitado material.')) +
    '</section><section class="stack">' + sectionTitle('Material en préstamo') +
    (current.length ? loanRows(current) : empty('No tienes material prestado.')) + '</section>' +
    (returned.length ? '<section class="stack">' + sectionTitle('Material devuelto') + loanRows(returned) + '</section>' : '') +
    '<dialog id="material-picker" aria-labelledby="material-picker-title"><div class="stack"><div class="actions">' +
    '<h2 id="material-picker-title">Pedir material</h2>' + button('Cerrar','quiet','type="button" id="close-material-picker"') +
    '</div><p class="muted">Material disponible. Las solicitudes pendientes no reservan unidades.</p><div id="available-material" class="stack"></div></div></dialog>';
  const picker = content.querySelector('#material-picker');
  const available = content.querySelector('#available-material');
  const groups = Map.groupBy(items,item => JSON.stringify([item.name,item.category]));
  available.innerHTML = groups.size ? Array.from(groups.values()).map(group => {
    const candidates = group.filter(item => !requests.some(request => request.item_id === item.id && request.status === 'pending'));
    return '<form class="card stack" data-request-item="' + esc(candidates[0]?.id ?? '') + '"><h3>' + esc(group[0].name) +
      '</h3><p class="muted">' + esc(group[0].category) + ' · ' + group.length + (group.length === 1 ? ' disponible' : ' disponibles') +
      '</p>' + errorRegion + button(candidates.length ? 'Solicitar una unidad' : 'Ya solicitado','secondary',candidates.length ? '' : 'disabled') + '</form>';
  }).join('') : empty('Ahora no hay material disponible.');
  content.querySelector('#ask-material').onclick = () => picker.showModal();
  content.querySelector('#close-material-picker').onclick = () => picker.close();
  for (const form of available.querySelectorAll('[data-request-item]')) bindForm(form,async () => {
    await ctx.api('/material-requests','POST',{ itemId:form.dataset.requestItem });
    picker.close();
    ctx.toast('Solicitud enviada');
    await myMaterialPage(content,ctx);
  });
  for (const form of content.querySelectorAll('[data-cancel-request]')) bindForm(form,async () => {
    await ctx.api('/material-requests/' + form.dataset.cancelRequest + '/cancel','POST',{});
    ctx.toast('Solicitud cancelada');
    await myMaterialPage(content,ctx);
  });
}
