import { randomUUID } from 'node:crypto';
import { normalize } from '../src/parts.js';
import { audit } from './events.mjs';
import { choice, requireThat, text } from './http.mjs';
import { transaction } from './store.mjs';

export const catalogValues = db => db.prepare('SELECT id, kind, label FROM catalog_values ORDER BY search_key, label').all();

export async function saveCatalogValue(db, actor, input) {
  const kind = choice(input.kind, ['instrument','voice','genre'], 'Tipo de valor');
  const label = text(input.label, 80, 'Nombre', true);
  const key = normalize(label);
  requireThat(key, 422, 'Introduce un nombre válido.');
  const id = randomUUID();
  return transaction(db, async () => {
    const result = await db.prepare('INSERT INTO catalog_values VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').run(id,kind,label,key);
    requireThat(result.changes, 409, 'Ese valor ya está en el catálogo.');
    await audit(db,actor.id,'catalog.add',id);
    return { id };
  });
}

export async function removeCatalogValue(db, actor, id) {
  return transaction(db, async () => {
    const result = await db.prepare('DELETE FROM catalog_values WHERE id = ?').run(id);
    requireThat(result.changes, 404, 'No se encuentra el valor del catálogo.');
    await audit(db,actor.id,'catalog.remove',id);
    return { id };
  });
}
