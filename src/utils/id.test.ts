import { describe, it, expect } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  it('defaults to the "el" prefix', () => {
    expect(generateId()).toMatch(/^el-\d+-\d+$/);
  });

  it('uses a custom prefix when given', () => {
    expect(generateId('user')).toMatch(/^user-\d+-\d+$/);
  });

  it('never returns the same id twice, even called back-to-back', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});
