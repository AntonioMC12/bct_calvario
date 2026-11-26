export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

export function samePart(file, member) {
  const instrument = normalize(member.instrument);
  return Boolean(instrument) && normalize(file.instrument) === instrument && normalize(file.voice) === normalize(member.voice);
}
