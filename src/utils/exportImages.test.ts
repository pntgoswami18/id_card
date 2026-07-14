import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { Template, CardRecord } from '../types';

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.toDataURL = vi.fn().mockReturnValue(PNG_1X1);
  canvas.toBlob = vi.fn((cb: BlobCallback) => cb(new Blob(['fake-image-bytes'], { type: 'image/png' })));
  return canvas;
}

vi.mock('html2canvas', () => ({
  default: vi.fn().mockImplementation(async () => fakeCanvas()),
}));

vi.mock('./saveFile', () => ({
  saveBlob: vi.fn().mockResolvedValue(true),
  safeFileName: (name: string) => name.replace(/[^a-z0-9_-]/gi, '_') || 'cards',
}));

function template(): Template {
  return {
    id: 't1', name: 'T', background: null, watermark: null,
    elements: [{ id: 'name', type: 'text', x: 10, y: 10, width: 80, height: 20, binding: 'name', fontSize: 12 }],
  };
}

function records(): CardRecord[] {
  return [
    { id: 'r1', data: { name: 'Alice' }, overrides: {} },
    { id: 'r2', data: { name: 'Bob' }, overrides: {} },
  ];
}

afterEach(() => {
  vi.clearAllMocks();
  // Guard against any leftover off-screen render container from a failed test.
  document.body.querySelectorAll('div').forEach((el) => el.remove());
});

describe('renderCardsToImages', () => {
  it('renders each requested index and returns a data URL + blob per card', async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { cards, errors } = await import('./exportImages').then((m) =>
      m.renderCardsToImages(template(), records(), [0, 1], 85.6, 53.98, { format: 'png' }),
    );
    expect(errors).toEqual([]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ recordIndex: 0, dataUrl: PNG_1X1 });
    expect(cards[0].blob).toBeInstanceOf(Blob);
    expect(html2canvas).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('reports an error and skips a missing record index without throwing', async () => {
    const { renderCardsToImages } = await import('./exportImages');
    const { cards, errors } = await renderCardsToImages(template(), records(), [0, 5], 85.6, 53.98, { format: 'png' });
    expect(cards).toHaveLength(1);
    expect(errors).toEqual(['Card 2: record not found (index 5)']);
  }, 10_000);

  it('reports a per-card error and continues when html2canvas rejects for one card', async () => {
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas)
      .mockImplementationOnce(async () => { throw new Error('canvas failed'); })
      .mockImplementationOnce(async () => fakeCanvas());

    const { renderCardsToImages } = await import('./exportImages');
    const { cards, errors } = await renderCardsToImages(template(), records(), [0, 1], 85.6, 53.98, { format: 'png' });
    expect(cards).toHaveLength(1);
    expect(errors).toEqual(['Card 1: canvas failed']);
  }, 10_000);

  it('calls onProgress once per requested index, in order', async () => {
    const onProgress = vi.fn();
    const { renderCardsToImages } = await import('./exportImages');
    await renderCardsToImages(template(), records(), [0, 1], 85.6, 53.98, { format: 'png', onProgress });
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  }, 10_000);

  it('removes its off-screen render container from the DOM when finished', async () => {
    const before = document.body.children.length;
    const { renderCardsToImages } = await import('./exportImages');
    await renderCardsToImages(template(), records(), [0], 85.6, 53.98, { format: 'png' });
    expect(document.body.children.length).toBe(before);
  }, 10_000);

  it('passes the JPEG mime type and quality through to canvas.toBlob/toDataURL', async () => {
    const canvas = fakeCanvas();
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockImplementationOnce(async () => canvas);

    const { renderCardsToImages } = await import('./exportImages');
    await renderCardsToImages(template(), records(), [0], 85.6, 53.98, { format: 'jpeg' });

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.92);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
  }, 10_000);

  it('passes the PNG mime type with no quality argument when format is png', async () => {
    const canvas = fakeCanvas();
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockImplementationOnce(async () => canvas);

    const { renderCardsToImages } = await import('./exportImages');
    await renderCardsToImages(template(), records(), [0], 85.6, 53.98, { format: 'png' });

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png', undefined);
  }, 10_000);
});

describe('exportCardsAsImages', () => {
  it('bundles rendered cards + a manifest.json into a ZIP and saves it', async () => {
    const { exportCardsAsImages } = await import('./exportImages');
    const { saveBlob } = await import('./saveFile');

    await exportCardsAsImages(template(), records(), [0, 1], 85.6, 53.98, 'My Workspace', { format: 'png' });

    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName, accept] = vi.mocked(saveBlob).mock.calls[0];
    expect(fileName).toBe('My_Workspace-export.zip');
    expect(accept).toEqual({ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } });

    const zip = await JSZip.loadAsync(blob as Blob);
    expect(Object.keys(zip.files).sort()).toEqual(['card-1.png', 'card-2.png', 'manifest.json']);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({
      version: 1, workspaceName: 'My Workspace', cardWidthMm: 85.6, cardHeightMm: 53.98, format: 'png', count: 2,
    });
  }, 10_000);

  it('pads card file numbers to match the total requested count', async () => {
    const { exportCardsAsImages } = await import('./exportImages');
    const { saveBlob } = await import('./saveFile');
    const manyRecords: CardRecord[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, data: {}, overrides: {} }));

    await exportCardsAsImages(template(), manyRecords, Array.from({ length: 10 }, (_, i) => i), 85.6, 53.98, 'W', { format: 'png' });

    const [blob] = vi.mocked(saveBlob).mock.calls[0];
    const zip = await JSZip.loadAsync(blob as Blob);
    expect(Object.keys(zip.files)).toContain('card-01.png');
    expect(Object.keys(zip.files)).toContain('card-10.png');
  }, 15_000);

  it('throws with all per-card error messages when every card fails to render', async () => {
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockImplementation(async () => { throw new Error('render failed'); });

    const { exportCardsAsImages } = await import('./exportImages');
    await expect(
      exportCardsAsImages(template(), records(), [0, 1], 85.6, 53.98, 'W', { format: 'png' }),
    ).rejects.toThrow(/All cards failed to export/);
  }, 10_000);
});
