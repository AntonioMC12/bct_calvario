export function samplePdf(title = 'Luz de Calvario') {
  const stave = Array.from({ length: 5 }, (_, i) => '70 ' + (500 + i * 12) + ' m 520 ' + (500 + i * 12) + ' l S').join('\n');
  const stream = 'BT /F1 24 Tf 70 710 Td (' + title.replace(/[()\\]/g,'') + ') Tj /F1 13 Tf 0 -28 Td ' +
    '(Corneta - Primera | Material ficticio de prueba) Tj ET\n' + stave;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object,i) => {
    const offset = Buffer.byteLength(pdf);
    pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return String(offset).padStart(10,'0') + ' 00000 n ';
  });
  return Buffer.from(pdf + 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('\n') + '\ntrailer\n' +
    '<< /Size 6 /Root 1 0 R >>\nstartxref\n' + Buffer.byteLength(pdf) + '\n%%EOF\n');
}
