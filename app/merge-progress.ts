import { ReppyConflictError } from './reppy-repository.ts';

const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(key => equal(x[key], y[key]));
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Three-way merge: only changes from the caller's acknowledged base are applied.
// Arrays with identities merge by identity; positional set plans require stable order.
export function mergeProgress<T>(base: T, local: T, remote: T): T {
  if (equal(local, base)) return structuredClone(remote);
  if (equal(remote, base) || equal(local, remote)) return structuredClone(local);
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const key = (item: unknown) => record(item) ? typeof item.id === 'string' ? item.id
      : typeof item.exerciseInstanceId === 'string' ? `${item.exerciseInstanceId}:${item.setNumber}` : undefined : undefined;
    if ([...base, ...local, ...remote].every(item => key(item) !== undefined)) {
      const b = new Map(base.map(item => [key(item), item]));
      const l = new Map(local.map(item => [key(item), item]));
      const r = new Map(remote.map(item => [key(item), item]));
      const items = new Map([...new Set([...b.keys(), ...l.keys(), ...r.keys()])]
        .map(id => [id, mergeProgress(b.get(id), l.get(id), r.get(id))]));
      const order = mergeProgress(base.map(key), local.map(key), remote.map(key));
      return order.map(id => items.get(id)) as T;
    }
    if (base.length === local.length && base.length === remote.length) {
      return base.map((item, index) => mergeProgress(item, local[index], remote[index])) as T;
    }
  } else if (record(base) && record(local) && record(remote)) {
    return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
      .map(key => [key, key === 'updatedAt' && typeof local[key] === 'string' && typeof remote[key] === 'string'
        ? (Date.parse(local[key]) >= Date.parse(remote[key]) ? local[key] : remote[key])
        : mergeProgress(base[key], local[key], remote[key])]).filter(([, value]) => value !== undefined)) as T;
  }
  throw new ReppyConflictError('Одно и то же поле тренировки изменено одновременно. Загрузи актуальные данные.');
}
