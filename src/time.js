export const zone = 'Europe/Madrid';

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function localMinute(date) {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(date)).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
}

export function madridInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const guess = Date.parse(value + 'Z');
  if (!Number.isFinite(guess)) return null;
  const candidates = [1, 2].map(hours => new Date(guess - hours * 3600000))
    .filter(date => localMinute(date) === value);
  return candidates.length === 1 ? candidates[0].toISOString() : null;
}
