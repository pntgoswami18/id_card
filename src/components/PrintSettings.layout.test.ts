import { describe, it, expect } from 'vitest';
import { computeLayout, computeEffectivePaperDims } from './PrintSettings';

describe('computeLayout', () => {
  it('computes cols/rows/perPage for a simple grid with no gap', () => {
    // A4 (210x297), 50x50 cards, 5mm margin, no gap: usable 200x287 -> 4 cols, 5 rows
    expect(computeLayout(210, 297, 50, 50, 5, 0)).toEqual({ cols: 4, rows: 5, perPage: 20 });
  });

  it('accounts for gap between cards', () => {
    // usable 200, card 50, gap 10: cols <= (200+10)/(50+10) = 3.5 -> 3
    expect(computeLayout(210, 297, 50, 50, 5, 10).cols).toBe(3);
  });

  it('never returns fewer than 1 col/row even when the card is larger than the usable area', () => {
    expect(computeLayout(210, 297, 500, 500, 5, 0)).toEqual({ cols: 1, rows: 1, perPage: 1 });
  });

  it('defaults gap to 0 when omitted', () => {
    expect(computeLayout(210, 297, 50, 50, 5)).toEqual(computeLayout(210, 297, 50, 50, 5, 0));
  });
});

describe('computeEffectivePaperDims', () => {
  it('forces portrait dims when paperOrientation is "portrait", regardless of raw input order', () => {
    const result = computeEffectivePaperDims(297, 210, 'portrait', 50, 50, 5, 0);
    expect(result).toEqual({ w: 210, h: 297, usedOrientation: 'portrait' });
  });

  it('forces landscape dims when paperOrientation is "landscape"', () => {
    const result = computeEffectivePaperDims(210, 297, 'landscape', 50, 50, 5, 0);
    expect(result).toEqual({ w: 297, h: 210, usedOrientation: 'landscape' });
  });

  it('"auto" picks whichever orientation fits more cards per page', () => {
    // 90x40 card on A4: portrait fits 2x7=14/page, landscape fits 3x5=15/page.
    const result = computeEffectivePaperDims(210, 297, 'auto', 90, 40, 5, 0);
    expect(result.usedOrientation).toBe('landscape');
    expect(result.w).toBe(297);
    expect(result.h).toBe(210);
  });

  it('"auto" prefers portrait on a tie', () => {
    // A square card fits the same count either way -> portrait wins ties.
    const result = computeEffectivePaperDims(210, 297, 'auto', 100, 100, 5, 0);
    expect(result.usedOrientation).toBe('portrait');
  });
});
