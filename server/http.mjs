export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireThat(condition, status, message, code) {
  if (!condition) throw new HttpError(status, message, code);
}

export function text(value, max, name, required = false) {
  requireThat(value === undefined || typeof value === 'string', 422, name + ': usa texto.');
  const result = (value ?? '').trim();
  requireThat(!required || result.length > 0, 422, name + ': campo obligatorio.');
  requireThat(result.length <= max, 422, name + ': máximo ' + max + ' caracteres.');
  return result;
}

export function integer(value, min, max, name) {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max, 422,
    name + ': usa un número entero entre ' + min + ' y ' + max + '.');
  return value;
}

export function choice(value, options, name) {
  requireThat(options.includes(value), 422, name + ': opción no válida.');
  return value;
}

export async function body(request, limit = 16384) {
  requireThat(request.headers['content-type']?.split(';')[0] === 'application/json',
    415, 'Se esperaba una solicitud JSON.');
  requireThat(Number(request.headers['content-length'] ?? 0) <= limit, 413, 'La solicitud supera el tamaño permitido.');
  const chunks = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) oversized = true;
    if (!oversized) chunks.push(chunk);
    if (oversized) break;
  }
  requireThat(!oversized, 413, 'La solicitud supera el tamaño permitido.');
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireThat(data && typeof data === 'object' && !Array.isArray(data), 400, 'Solicitud no válida.');
    return data;
  } catch {
    throw new HttpError(400, 'Solicitud JSON no válida.');
  }
}

export function json(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(data));
}
