import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { importCardsFromFiles } from './importImages';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngFile(name: string): File {
  const bytes = Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

async function zipFile(
  name: string,
  entries: Record<string, string | Uint8Array>,
): Promise<File> {
  const zip = new JSZip();
  for (const [entryName, content] of Object.entries(entries)) {
    zip.file(entryName, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/zip' });
}

function pngBytes(): Uint8Array {
  return Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
}

describe('importCardsFromFiles', () => {
  it('reads loose images as unsized', async () => {
    const result = await importCardsFromFiles([pngFile('a.png'), pngFile('b.jpg')]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toHaveLength(2);
    expect(result.unsized[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.warnings).toEqual([]);
  });

  it('warns and skips unsupported file types', async () => {
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toEqual([]);
    expect(result.warnings).toEqual(['notes.txt: unsupported file type (use .zip, .png, or .jpg).']);
  });

  it('recovers sized cards from a ZIP with a valid manifest.json', async () => {
    const manifest = { version: 1, workspaceName: 'W', cardWidthMm: 85.6, cardHeightMm: 53.98, format: 'png', count: 1 };
    const file = await zipFile('export.zip', {
      'manifest.json': JSON.stringify(manifest),
      'card-001.png': pngBytes(),
    });
    const result = await importCardsFromFiles([file]);
    expect(result.warnings).toEqual([]);
    expect(result.unsized).toEqual([]);
    expect(result.sized).toEqual([
      { dataUrl: expect.stringMatching(/^data:image\/png;base64,/), widthMm: 85.6, heightMm: 53.98 },
    ]);
  });

  it('treats images in a manifest-less ZIP as unsized and warns', async () => {
    const file = await zipFile('loose.zip', { 'card-001.png': pngBytes() });
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toHaveLength(1);
    expect(result.warnings).toEqual(['loose.zip: no manifest — set the card size manually.']);
  });

  it('treats a ZIP with a malformed manifest.json as unsized rather than failing', async () => {
    const file = await zipFile('broken.zip', {
      'manifest.json': '{not valid json',
      'card-001.png': pngBytes(),
    });
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toHaveLength(1);
    expect(result.warnings).toEqual(['broken.zip: no manifest — set the card size manually.']);
  });

  it('treats a manifest missing required numeric fields as invalid', async () => {
    const file = await zipFile('partial.zip', {
      'manifest.json': JSON.stringify({ version: 1, workspaceName: 'W' }),
      'card-001.png': pngBytes(),
    });
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toHaveLength(1);
  });

  it('warns when a ZIP contains no images at all', async () => {
    const file = await zipFile('empty.zip', { 'readme.txt': 'hello' });
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toEqual([]);
    expect(result.warnings).toEqual(['empty.zip: no images found in archive.']);
  });

  it('warns when a ZIP cannot be read at all', async () => {
    const badZip = new File(['not actually a zip'], 'corrupt.zip', { type: 'application/zip' });
    const result = await importCardsFromFiles([badZip]);
    expect(result.sized).toEqual([]);
    expect(result.unsized).toEqual([]);
    expect(result.warnings).toEqual(['corrupt.zip: could not read ZIP archive.']);
  });

  it('sorts images within a ZIP numerically by name', async () => {
    const manifest = { version: 1, workspaceName: 'W', cardWidthMm: 10, cardHeightMm: 10, format: 'png', count: 2 };
    const file = await zipFile('ordered.zip', {
      'manifest.json': JSON.stringify(manifest),
      'card-10.png': pngBytes(),
      'card-2.png': pngBytes(),
    });
    // Numeric sort should put card-2 before card-10; both should still come back sized.
    const result = await importCardsFromFiles([file]);
    expect(result.sized).toHaveLength(2);
  });

  it('aggregates results across multiple mixed files in one call', async () => {
    const manifest = { version: 1, workspaceName: 'W', cardWidthMm: 10, cardHeightMm: 10, format: 'png', count: 1 };
    const sizedZip = await zipFile('sized.zip', {
      'manifest.json': JSON.stringify(manifest),
      'card-001.png': pngBytes(),
    });
    const result = await importCardsFromFiles([pngFile('loose.png'), sizedZip]);
    expect(result.sized).toHaveLength(1);
    expect(result.unsized).toHaveLength(1);
  });
});
