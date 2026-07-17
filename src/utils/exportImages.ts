import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import CardCanvas from '../components/CardCanvas/CardCanvas';
import type { Template, CardRecord } from '../types';
import { saveBlob, safeFileName } from './saveFile';
import type { CardImage } from './aggregatePdf';

export type ExportFormat = 'png' | 'jpeg';

/** Written into the export ZIP as `manifest.json`; read back by the importer. */
export interface ExportManifest {
  version: 1;
  workspaceName: string;
  cardWidthMm: number;
  cardHeightMm: number;
  format: ExportFormat;
  count: number;
}

export interface ExportOptions {
  format: ExportFormat;
  /** Pixel width to render each card at before html2canvas scaling. */
  renderWidthPx?: number;
  /** html2canvas pixel ratio — higher = sharper output. Default 3. */
  scale?: number;
  onProgress?: (done: number, total: number) => void;
}

/** One rendered card: a data URL plus the blob backing it. */
export interface RenderedCard {
  /** 0-based index into the `records` array this card was rendered from. */
  recordIndex: number;
  dataUrl: string;
  blob: Blob;
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
 * Renders each card in `indices` off-screen and captures it with html2canvas.
 * Returns the rendered cards (data URL + blob) and any per-card error messages.
 * This is the shared rendering core used both by ZIP export and by aggregate-PDF
 * generation — keep it free of any download/zip concerns.
 */
export async function renderCardsToImages(
  template: Template,
  records: CardRecord[],
  indices: number[],
  cardWidthMm: number,
  cardHeightMm: number,
  options: ExportOptions,
): Promise<{ cards: RenderedCard[]; errors: string[] }> {
  const {
    format,
    renderWidthPx = 400,
    scale = 3,
    onProgress,
  } = options;

  const mimeType = `image/${format}`;
  const quality = format === 'jpeg' ? 0.92 : undefined;
  const errors: string[] = [];
  const cards: RenderedCard[] = [];

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

          cards.push({ recordIndex, dataUrl: canvas.toDataURL(mimeType, quality), blob });
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

  return { cards, errors };
}

/**
 * Renders each card in `indices` off-screen, bundles all images into a ZIP
 * (alongside a `manifest.json` recording the card's mm dimensions and format),
 * and saves it. The manifest lets the aggregate-PDF importer lay the images out
 * without asking the user for the card size.
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
  const { format } = options;
  const ext = format === 'jpeg' ? 'jpg' : 'png';

  const { cards, errors } = await renderCardsToImages(
    template, records, indices, cardWidthMm, cardHeightMm, options,
  );

  if (cards.length === 0) {
    throw new Error(`All cards failed to export:\n${errors.join('\n')}`);
  }

  const zip = new JSZip();
  const pad = String(indices.length).length;
  cards.forEach((card, i) => {
    zip.file(`card-${String(i + 1).padStart(pad, '0')}.${ext}`, card.blob);
  });

  const manifest: ExportManifest = {
    version: 1,
    workspaceName,
    cardWidthMm,
    cardHeightMm,
    format,
    count: cards.length,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const fileName = `${safeFileName(workspaceName)}-export.zip`;
  await saveBlob(zipBlob, fileName, {
    description: 'ZIP Archive',
    accept: { 'application/zip': ['.zip'] },
  });
}

/**
 * Bundles already-rendered `CardImage[]` (the same shape `aggregateCardsToPdf`
 * consumes) into a ZIP, one image file per card. Used by CombinePdfDialog's
 * "export as images" output mode as an alternative to combining into a PDF —
 * unlike `exportCardsAsImages`, this doesn't render from a template/records,
 * it just repackages data URLs the caller already produced (from one or more
 * workspaces, or from previously-imported files).
 *
 * No manifest is written: combined sources can mix card sizes (unlike a
 * single workspace's export), so a single-size `ExportManifest` doesn't apply
 * cleanly. A later re-import via "From exported images" simply lands in the
 * already-supported "unsized" bucket requiring manual width/height entry.
 */
export async function exportCardImagesToZip(
  cards: CardImage[],
  format: ExportFormat,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (cards.length === 0) throw new Error('No cards to export.');

  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const zip = new JSZip();
  const pad = String(cards.length).length;

  for (let i = 0; i < cards.length; i++) {
    const blob = await (await fetch(cards[i].dataUrl)).blob();
    zip.file(`card-${String(i + 1).padStart(pad, '0')}.${ext}`, blob);
    onProgress?.(i + 1, cards.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  await saveBlob(zipBlob, `${safeFileName(fileName)}.zip`, {
    description: 'ZIP Archive',
    accept: { 'application/zip': ['.zip'] },
  });
}
