// Huddle: a small JSON Schema validator, enough for huddle.schema.json (no dependencies).
// Supports: type (string, integer, number, boolean, array, object), enum, required, properties, additionalProperties: false,
// items, minimum, minLength and pattern. Returns [{ path, message }]: empty when the value is valid. `path` is `a.b[2]`.

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isType = (t, v) => (t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : kind(v) === t);
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : kind(v) === 'object' || kind(v) === 'array' ? kind(v) : String(v));
const join = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

export function validate(schema, value, path = '') {
  const errors = [];
  const bad = (message) => errors.push({ path, message });

  if (schema.type && !isType(schema.type, value)) {
    bad(`must be of type ${schema.type} (got ${kind(value)})`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    bad(`must be one of ${schema.enum.join(', ')} (got ${show(value)})`);
    return errors;
  }
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) bad('must not be empty');
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) bad(`must match ${schema.pattern} (got ${show(value)})`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) bad(`must be >= ${schema.minimum} (got ${value})`);
  if (kind(value) === 'array' && schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, join(path, i))));
  if (kind(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push({ path: join(path, key), message: 'is required' });
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validate(schema.properties[key], v, join(path, key)));
      else if (schema.additionalProperties === false) errors.push({ path: join(path, key), message: 'is not allowed' });
    }
  }
  return errors;
}
