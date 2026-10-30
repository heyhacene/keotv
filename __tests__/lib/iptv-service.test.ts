import { toArray } from '@/lib/iptv-service';

describe('toArray', () => {
  it('returns an empty array when given undefined or null', () => {
    expect(toArray(undefined)).toEqual([]);
    expect(toArray(null)).toEqual([]);
  });

  it('returns the same array when given an array', () => {
    const arr = [1, 2, 3];
    expect(toArray(arr)).toBe(arr);
  });

  it('parses a stringified array and returns it', () => {
    expect(toArray('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('parses a stringified object and returns its values', () => {
    expect(toArray('{"a": 1, "b": 2}')).toEqual([1, 2]);
  });

  it('returns an empty array when given an invalid JSON string', () => {
    expect(toArray('invalid json')).toEqual([]);
  });

  it('returns object values when given an object', () => {
    expect(toArray({ a: 1, b: 2 })).toEqual([1, 2]);
  });

  it('returns an empty array for other string primitives', () => {
      expect(toArray('"valid json string"')).toEqual([]);
  });
});
