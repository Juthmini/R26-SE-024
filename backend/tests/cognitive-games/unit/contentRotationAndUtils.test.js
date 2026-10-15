// UNIT TESTS - content rotation + shared game utilities (no database)
const {
  rotateSample,
  normalizeKey,
  ROTATION_GAMES,
} = require('../../../src/services/cognitive/games/contentRotation');
const { shuffle, pickDistractors } = require('../../../src/services/cognitive/games/gameContentUtils');

const pool = ['Apple', 'Dog', 'Car', 'Flower', 'Book', 'Music', 'House'].map((label) => ({ label }));
const keyOf = (item) => item.label;

describe('rotateSample', () => {
  test('UT-BE-14 prefers items the patient has NOT seen recently', () => {
    const recent = ['apple', 'dog', 'car']; // normalised keys, oldest -> newest
    for (let i = 0; i < 25; i += 1) {
      const picked = rotateSample(pool, 4, recent, keyOf).map(keyOf);
      expect(picked).toHaveLength(4);
      expect(picked.some((label) => recent.includes(label.toLowerCase()))).toBe(false);
    }
  });

  test('UT-BE-15 when fresh items run out it tops up with the LEAST recently seen ones', () => {
    // Everything except "House" has been seen; "book" is the oldest entry.
    const recent = ['book', 'music', 'apple', 'dog', 'car', 'flower'];
    const picked = rotateSample(pool, 3, recent, keyOf).map(keyOf);
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe('House'); // the only unseen item comes first
    expect(picked.slice(1)).toEqual(['Book', 'Music']); // then the two oldest-seen
  });
});

describe('shared utilities', () => {
  test('UT-BE-16 pickDistractors never returns an excluded (correct) answer and has no duplicates', () => {
    const result = pickDistractors(['Cat', ' cat ', 'Dog', 'dog', 'Bird', 'Fish'], ['CAT'], 10);
    const lowered = result.map((v) => v.trim().toLowerCase());
    expect(lowered).not.toContain('cat');
    expect(new Set(lowered).size).toBe(lowered.length);
    expect([...lowered].sort()).toEqual(['bird', 'dog', 'fish']);
  });

  test('UT-BE-17 normalizeKey trims/lower-cases and tolerates null; personal-fact games are not rotated', () => {
    expect(normalizeKey('  Apple ')).toBe('apple');
    expect(normalizeKey(null)).toBe('');
    expect(normalizeKey(undefined)).toBe('');
    expect(ROTATION_GAMES.has('memory_recall')).toBe(true);
    expect(ROTATION_GAMES.has('orientation_game')).toBe(false);
  });

  test('UT-BE-18 shuffle returns a new array with the same elements and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const copy = [...input];
    const out = shuffle(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(copy);
  });
});
