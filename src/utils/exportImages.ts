import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import CardCanvas from '../components/CardCanvas/CardCanvas';
import type { Template, CardRecord } from '../types';

export type ExportFormat = 'png' | 'jpeg';

export interface ExportOptions {
  format: ExportFormat;
  /** Pixel width to render each card at before html2canvas scaling. */
  renderWidthPx?: number;
  /** html2canvas pixel ratio — higher = sharper output. Default 3. */
  scale?: number;
  onProgress?: (done: number, total: number) => void;
}

async function waitForContainerReady(container: HTMLElement): Promise<void> {
  await document.fonts.ready;
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
}

/**
 * Renders each card in `indices` off-screen, captures it with html2canvas,
 * bundles all images into a ZIP, and triggers a browser download.
 */
export async function exportCardsAsImages(
  template: Template,
  records: CardRecord[],
  indices: number[],
  cardWidthMm: number,
  cardHeightMm: number,
  workspaceName: string,
  options: ExportOptions,
): Promise<void> {
  const {
    format,
    renderWidthPx = 400,
    scale = 3,
    onProgress,
  } = options;

  const zip = new JSZip();
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const mimeType = `image/${format}`;
  const quality = format === 'jpeg' ? 0.92 : undefined;
  const errors: string[] = [];

  // Create a single reusable container + root for all cards
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 0;
    overflow: hidden;
    background: white;
  `;
  const scalerDiv = document.createElement('div');
  scalerDiv.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${cardWidthMm}mm;
    height: ${cardHeightMm}mm;
  `;
  container.appendChild(scalerDiv);

  let appended = false;
  try {
    document.body.appendChild(container);
    appended = true;

    // Measure the card's natural CSS pixel size (accounts for browser zoom and dpi).
    const { width: naturalWidth, height: naturalHeight } = scalerDiv.getBoundingClientRect();
    const naturalWidthPx = Math.round(naturalWidth);
    const naturalHeightPx = Math.round(naturalHeight);

    // Fold all upscaling into html2canvas's own `scale` parameter instead of using a
    // CSS transform on the wrapper div. A CSS transform causes html2canvas to rasterise
    // background-image CSS properties at the element's pre-transform layout size and then
    // magnify the result via the transform matrix, producing blurry / pixelated backgrounds.
    // html2canvas's `scale` parameter has no such issue — it renders each CSS pixel as
    // `scale` output pixels natively, backgrounds included.
    // Output image size remains renderWidthPx × scale pixels wide (identical to before).
    const h2cScale = naturalWidthPx > 0 ? (renderWidthPx * scale) / naturalWidthPx : scale;

    container.style.width = `${naturalWidthPx}px`;
    container.style.height = `${naturalHeightPx}px`;
    container.style.left = `-${naturalWidthPx + 100}px`;
    // No CSS transform — html2canvas handles all upscaling via h2cScale.

    const root = createRoot(scalerDiv);

    try {
      for (let i = 0; i < indices.length; i++) {
        const recordIndex = indices[i];
        const record = records[recordIndex];
        if (!record) {
          errors.push(`Card ${i + 1}: record not found (index ${recordIndex})`);
          onProgress?.(i + 1, indices.length);
          continue;
        }

        try {
          root.render(
            createElement(CardCanvas, {
              template,
              record,
              widthMm: cardWidthMm,
              heightMm: cardHeightMm,
              designMode: false,
            }),
          );

          // Wait for React to flush, then wait for fonts and images to load
          await new Promise<void>((resolve) => setTimeout(resolve, 120));
          await waitForContainerReady(container);

          const canvas = await html2canvas(container, {
            width: naturalWidthPx,
            height: naturalHeightPx,
            scale: h2cScale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
          });

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
              mimeType,
              quality,
            );
          });

          const filename = `card-${String(i + 1).padStart(String(indices.length).length, '0')}.${ext}`;
          zip.file(filename, blob);
        } catch (err) {
          errors.push(`Card ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
        }

        onProgress?.(i + 1, indices.length);
      }
    } finally {
      root.unmount();
    }
  } finally {
    if (appended) {
      document.body.removeChild(container);
    }
  }

  if (errors.length > 0 && errors.length === indices.length) {
    throw new Error(`All cards failed to export:\n${errors.join('\n')}`);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  const safeName = workspaceName
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const fileName = `${safeName || 'cards'}-export.zip`;

  type SavePickerOpts = {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  };
  type FSWritable = { write(data: BufferSource | Blob | string): Promise<void>; close(): Promise<void> };
  type FSFileHandle = { createWritable(): Promise<FSWritable> };
  const win = window as Window & { showSaveFilePicker?: (opts?: SavePickerOpts) => Promise<FSFileHandle> };

  if (win.showSaveFilePicker) {
    try {
      const fileHandle = await win.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(zipBlob);
      } finally {
        await writable.close();
      }
      return;
    } catch (err) {
      // User cancelled the picker — abort silently
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Fall through to legacy download on other errors
    }
  }

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation so the browser has time to initiate the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
