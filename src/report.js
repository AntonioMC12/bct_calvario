import { actionLink, back, bindForm, button, dayKey, displayTime, empty, errorRegion, esc, field, header,
  icon, options, row, sectionTitle } from './ui.js';
import { canManage } from './roles.js';

const columns = [
  ['yes','Asistirán'], ['no','No asistirán'], ['unconfirmed','Sin confirmar'],
  ['present','Presentes'], ['absent','No presentes'], ['unrecorded','Sin registrar'],
];
const fields = ['recorded','yes','no','present','absent'];

function totals(rows) {
  const sum = Object.fromEntries(fields.map(key => [key,0]));
  for (const item of rows) for (const key of fields) sum[key] += item[key];
  return { ...sum, unconfirmed:sum.recorded - sum.yes - sum.no, unrecorded:sum.recorded - sum.present - sum.absent };
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"','""') + '"';
}

function exportReport({ rows, from, to }) {
  const records = [['Evento','Fecha (Madrid)','Tipo','Instrumento','Voz','Componentes con registro',...columns.map(([,label]) => label)]];
  for (const item of rows) {
    const values = totals([item]);
    records.push([item.title, displayTime(item.starts), item.type, item.instrument, item.voice, values.recorded,
      ...columns.map(([key]) => values[key])]);
  }
  const csv = records.map(record => record.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF',csv],{ type:'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'calvario-asistencia-' + from + '-' + to + '.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}

function breakdown(groups) {
  if (!groups.size) return empty('Todavía no hay intenciones ni presencias registradas en este periodo.');
  return '<div class="report-scroll" tabindex="0" role="region" aria-label="Resumen por instrumento y voz"><table><thead><tr>' +
    '<th scope="col">Instrumento y voz</th>' + columns.map(([,label]) => '<th scope="col">' + label + '</th>').join('') +
    '</tr></thead><tbody>' + [...groups].sort(([a],[b]) => a.localeCompare(b,'es')).map(([group,items]) => {
      const values = totals(items);
      return '<tr><th scope="row">' + esc(group) + '</th>' + columns.map(([key]) => '<td>' + values[key] + '</td>').join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

export function attendanceReportPage(content, ctx) {
  const previous = back('Gestión','#/gestion');
  if (!canManage(ctx.state.member.role) || ctx.state.offline) {
    content.innerHTML = previous + empty('Consultar el informe requiere permisos de gestión y conexión.');
    return;
  }
  const today = dayKey(Date.now());
  const monthStart = today.slice(0,8) + '01';
  const types = ['Ensayo','Actuación','Reunión','Procesión','Certamen','Concierto'];
  content.innerHTML = '<section class="attendance-report">' + previous + header('Informe de asistencia','Intención y presencia por periodo') +
    '<form class="card stack report-filter"><fieldset class="report-period"><legend>Periodo</legend><div class="report-dates">' +
    field('from','Desde','type="date" required',monthStart) + field('to','Hasta','type="date" required',today) + '</div></fieldset>' +
    '<label>Tipo de evento<select name="type"><option value="">Todos los tipos</option>' +
    options(Object.fromEntries(types.map(type => [type,type]))) + '</select></label>' + errorRegion +
    '<button class="button primary">' + icon('chart') + 'Consultar informe</button></form>' +
    '<div id="attendance-report-results" class="stack"></div></section>';
  const form = content.querySelector('form');
  const target = content.querySelector('#attendance-report-results');
  bindForm(form,async input => {
    target.innerHTML = '<p class="muted" role="status">Calculando informe…</p>';
    let report;
    try { report = await ctx.api('/reports/attendance','POST',input); }
    catch (error) { target.innerHTML = ''; throw error; }
    if (!report.rows.length) {
      target.innerHTML = '<section class="card stack report-empty"><span class="tile">' + icon('clipboard') + '</span>' +
        '<div><h2>Sin convocatorias en este periodo</h2><p class="muted">El informe incluye eventos iniciados, sin cancelar y con lista de presencia habilitada.</p></div>' +
        actionLink('Ir a Pasar lista','#/gestion/presencia') + '</section>';
      return;
    }
    const events = Map.groupBy(report.rows,item => item.id);
    const groups = Map.groupBy(report.rows.filter(item => item.recorded),item =>
      [item.instrument,item.voice].filter(Boolean).join(' · ') || 'Sin instrumento');
    const values = totals(report.rows);
    const measured = values.present + values.absent;
    const rate = measured ? new Intl.NumberFormat('es-ES',{ style:'percent',maximumFractionDigits:1 }).format(values.present / measured) : '—';
    const facts = [['Eventos', events.size], ['Presentes',values.present], ['No presentes',values.absent], ['Asistencia comprobada',rate]];
    target.innerHTML = '<section class="card stack">' + sectionTitle('Resumen del periodo','', 'chart') +
      '<p class="muted">' + esc(report.from + ' a ' + report.to + (report.type ? ' · ' + report.type : '')) + '</p>' +
      '<dl class="metrics">' + facts.map(([label,value]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>').join('') + '</dl>' +
      '<p class="muted">Se cruzan los componentes con alguna intención o presencia registrada. El porcentaje usa solo presencias comprobadas.</p>' +
      '<div class="actions report-export">' + button('Exportar CSV','secondary','type="button" id="report-csv"') +
      button('Imprimir o guardar PDF','secondary','type="button" id="report-print"') + '</div></section>' +
      '<section class="card stack">' + sectionTitle('Por instrumento y voz') + breakdown(groups) + '</section>' +
      '<section>' + sectionTitle('Eventos incluidos') + '<div class="row-list">' + [...events].map(([id,items]) => {
        const { title, starts } = items[0];
        const t = totals(items);
        return row(title, displayTime(starts) + ' · ' + t.present + ' presentes · ' + t.absent + ' no presentes · ' +
          t.unrecorded + ' sin registrar', '#/calendario/' + id + '/asistentes','calendario');
      }).join('') + '</div></section>';
    target.querySelector('#report-csv').onclick = () => exportReport(report);
    target.querySelector('#report-print').onclick = () => window.print();
  });
  form.requestSubmit();
}
