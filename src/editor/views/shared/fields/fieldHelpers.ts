import type { Schemable } from '../../../../utility/schema';

/** Plain text of an HTML snippet. DOMParser documents are inert: no scripts, no image loads. */
export function plainText(html: string | undefined | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function isEmptyValue(value: any): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** A `schema` field whose sub-fields are all numbers — edited as a key/number map (costs, prices). */
export function isNumberMap(field: Schemable | undefined): boolean {
  if (!field || field.type !== 'schema' || !field.objects) return false;
  const subs = Object.values(field.objects);
  return subs.length > 0 && subs.every(sub => sub?.type === 'number');
}

/** Types the compact inputs cover. The rest (rich text, files, lists, nested schemas) use the form's own field. */
export function isSimpleField(field: Schemable | undefined): boolean {
  if (!field) return false;
  if (isNumberMap(field)) return true;
  return ['number', 'boolean', 'chooseOne', 'chooseMany', 'string', 'textarea', 'color'].includes(field.type);
}

export function displayValue(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function nested(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), obj);
}

/** Display name of an entity row: the given ref path, then name, traits.name, meta.name. */
export function entityName(row: any, refPath?: string): string | undefined {
  const candidates = [refPath ? nested(row, refPath) : undefined, row?.name, row?.traits?.name, row?.meta?.name];
  const found = candidates.find(value => typeof value === 'string' && value.trim());
  return found ? plainText(found) : undefined;
}

/** "id (Name)" when a name differs from the id, else the id. */
export function idLabel(id: string, name: string | undefined): string {
  return name && name !== id ? `${id} (${name})` : id;
}
