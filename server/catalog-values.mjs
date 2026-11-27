import { randomUUID } from 'node:crypto';
import { normalize } from '../src/parts.js';
import { audit } from './events.mjs';
import { choice, requireThat, text } from './http.mjs';
import { transaction } from './store.mjs';

export const catalogValues = db => db.prepare('SELECT id, kind, label, instrument FROM catalog_values ORDER BY search_key, label').all();

export async function saveCatalogValue(db, actor, input) {
  const kind = choice(input.kind, ['instrument','voice','genre'], 'Tipo de valor');
  const label = text(input.label, 80, 'Nombre', true);
  const instrument = kind === 'voice' ? text(input.instrument,80,'Instrumento',true) : '';
  const key = instrument ? JSON.stringify([normalize(instrument),normalize(label)]) : normalize(label);
  requireThat(normalize(label), 422, 'Introduce un nombre válido.');
  const id = randomUUID();
  return transaction(db, async () => {
    if (instrument) requireThat(await db.prepare("SELECT 1 FROM catalog_values WHERE kind = 'instrument' AND label = ?").get(instrument),422,'Elige un instrumento del catálogo.');
    const result = await db.prepare('INSERT INTO catalog_values(id,kind,label,search_key,instrument) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(id,kind,label,key,instrument);
    requireThat(result.changes, 409, 'Ese valor ya está en el catálogo.');
    await audit(db,actor.id,'catalog.add',id);
    return { id };
  });
}

export async function removeCatalogValue(db, actor, id) {
  return transaction(db, async () => {
    const entry = await db.prepare('SELECT kind,label FROM catalog_values WHERE id = ?').get(id);
    if (entry?.kind === 'instrument') await db.prepare("DELETE FROM catalog_values WHERE kind = 'voice' AND instrument = ?").run(entry.label);
    const result = await db.prepare('DELETE FROM catalog_values WHERE id = ?').run(id);
    requireThat(result.changes, 404, 'No se encuentra el valor del catálogo.');
    await audit(db,actor.id,'catalog.remove',id);
    return { id };
  });
}

export async function validateMusicalSelection(db, instrument, voice) {
  const values = await catalogValues(db);
  const instruments = values.filter(value => value.kind === 'instrument');
  if (!instruments.length) return;
  requireThat(instruments.some(value => value.label === instrument),422,'Elige un instrumento de la banda.');
  const voices = values.filter(value => value.kind === 'voice' && value.instrument === instrument);
  requireThat(voices.length ? voices.some(value => value.label === voice) : !voice,
    422,voices.length ? 'Elige una voz de ese instrumento.' : 'Ese instrumento no tiene voces.');
}
