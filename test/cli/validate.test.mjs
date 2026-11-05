import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../lib/cli/validate.mjs';

const schema = {
  type: 'object', required: ['name'], additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    kind: { enum: ['a', 'b'] },
    n: { type: 'integer', minimum: 1 },
    list: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' } },
    sub: { type: 'object', additionalProperties: false, properties: { x: { type: 'string' } } },
  },
};

test('a valid value has no errors', () => assert.deepEqual(validate(schema, { name: 'x', kind: 'a', n: 2, list: ['ab'], sub: { x: 'y' } }), []));
test('a missing required field is named', () => assert.deepEqual(validate(schema, {}), [{ path: 'name', message: 'is required' }]));
test('a wrong type is named with what it got', () => assert.deepEqual(validate(schema, { name: 3 }), [{ path: 'name', message: 'must be of type string (got number)' }]));
test('an unknown field is refused, nested too', () => {
  assert.deepEqual(validate(schema, { name: 'x', typo: 1 }), [{ path: 'typo', message: 'is not allowed' }]);
  assert.deepEqual(validate(schema, { name: 'x', sub: { y: 1 } }), [{ path: 'sub.y', message: 'is not allowed' }]);
});
test('enum, integer, minimum, minLength and pattern', () => {
  assert.match(validate(schema, { name: 'x', kind: 'c' })[0].message, /must be one of a, b \(got "c"\)/);
  assert.equal(validate(schema, { name: 'x', n: 1.5 })[0].path, 'n');
  assert.match(validate(schema, { name: 'x', n: 0 })[0].message, /must be >= 1/);
  assert.match(validate(schema, { name: '' })[0].message, /must not be empty/);
  assert.deepEqual(validate(schema, { name: 'x', list: ['ok', 'No'] }).map((e) => e.path), ['list[1]']);
});
test('an array is not an object, null is not a string', () => {
  assert.equal(validate(schema, []).length > 0, true);
  assert.match(validate(schema, { name: null })[0].message, /got null/);
});
