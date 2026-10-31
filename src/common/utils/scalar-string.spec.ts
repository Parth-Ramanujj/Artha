import { scalarToString } from './scalar-string';

describe('scalarToString', () => {
  it('keeps strings, numbers and booleans as written', () => {
    expect(scalarToString('a')).toBe('a');
    expect(scalarToString(0)).toBe('0');
    expect(scalarToString(false)).toBe('false');
  });
  it('uses the fallback for null and undefined only', () => {
    expect(scalarToString(null, 'x')).toBe('x');
    expect(scalarToString(undefined, 'x')).toBe('x');
    expect(scalarToString('', 'x')).toBe('');
  });
  it('never produces [object Object]', () => {
    expect(scalarToString({ a: 1 })).toBe('');
    expect(scalarToString([1])).toBe('');
  });
});
