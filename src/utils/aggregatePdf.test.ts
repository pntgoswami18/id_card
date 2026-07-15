import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateCardsToPdf, type CardImage } from './aggregatePdf';

vi.mock('./saveFile', () => ({
  saveBlob: vi.fn().mockResolvedValue(true),
}));

// A valid 1x1 transparent PNG, small enough to embed inline.
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const JPEG_1X1 =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

function card(widthMm: number, heightMm: number, dataUrl = PNG_1X1): CardImage {
  return { dataUrl, widthMm, heightMm };
}

describe('aggregateCardsToPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when given no cards', async () => {
    await expect(aggregateCardsToPdf([], {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
    })).rejects.toThrow('No cards to aggregate.');
  });

  it('generates a PDF and saves it via saveBlob with the given filename', async () => {
    const { saveBlob } = await import('./saveFile');
    await aggregateCardsToPdf([card(50, 30)], {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
      fileName: 'my-cards',
    });
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName, accept] = vi.mocked(saveBlob).mock.calls[0];
    expect(fileName).toBe('my-cards.pdf');
    expect(accept).toEqual({ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } });
    expect(blob).toBeInstanceOf(Blob);
  });

  it('defaults the filename to "combined-cards" when not given', async () => {
    const { saveBlob } = await import('./saveFile');
    await aggregateCardsToPdf([card(50, 30)], {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
    });
    expect(vi.mocked(saveBlob).mock.calls[0][1]).toBe('combined-cards.pdf');
  });

  it('reports progress for every card across differently-sized groups', async () => {
    const onProgress = vi.fn();
    const cards = [card(50, 30), card(50, 30), card(85.6, 53.98)];
    await aggregateCardsToPdf(cards, {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
    // done count is monotonically increasing.
    const doneValues = onProgress.mock.calls.map(([done]) => done);
    expect(doneValues).toEqual([1, 2, 3]);
  });

  it('accepts JPEG data URLs alongside PNG', async () => {
    const { saveBlob } = await import('./saveFile');
    await aggregateCardsToPdf([card(50, 30, JPEG_1X1)], {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
    });
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it('mixed-size inputs each get their own packed group without crashing', async () => {
    const cards = [
      ...Array.from({ length: 5 }, () => card(50, 30)),
      ...Array.from({ length: 3 }, () => card(85.6, 53.98)),
    ];
    await expect(aggregateCardsToPdf(cards, {
      paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 2,
    })).resolves.toBeUndefined();
  });
});
