import { jsPDF } from 'jspdf';
import { computeLayout, computeEffectivePaperDims } from '../components/PrintSettings';
import { saveBlob } from './saveFile';

/** A single card image ready to be placed in the aggregated PDF. */
export type CardImage = {
  /** PNG or JPEG data URL. */
  dataUrl: string;
  /** Oriented card width in mm (as it should appear on paper). */
  widthMm: number;
  /** Oriented card height in mm. */
  heightMm: number;
};

export type AggregatePdfOptions = {
  /** Paper dimensions in portrait order (short × long); orientation is applied per group. */
  paperWidthMm: number;
  paperHeightMm: number;
  paperOrientation: 'portrait' | 'landscape' | 'auto';
  pageMarginMm: number;
  cardGapMm: number;
  /** Suggested download filename (without extension). */
  fileName?: string;
  onProgress?: (done: number, total: number) => void;
};

/** jsPDF needs the format token, not a mime type. */
function pdfImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';
}

/**
 * Packs `cards` densely into a single PDF, ignoring whatever workspace/page
 * boundaries the cards originally came from. Cards are grouped by mm size so
 * that mixed-size inputs each get their own tightly-packed run of pages — this
 * is what eliminates the wasted last page each workspace produces on its own.
 */
export async function aggregateCardsToPdf(
  cards: CardImage[],
  options: AggregatePdfOptions,
): Promise<void> {
  if (cards.length === 0) throw new Error('No cards to aggregate.');

  const {
    paperWidthMm,
    paperHeightMm,
    paperOrientation,
    pageMarginMm,
    cardGapMm,
    fileName = 'combined-cards',
    onProgress,
  } = options;

  // Group by exact mm size so each size packs into its own grid.
  const groups = new Map<string, CardImage[]>();
  for (const card of cards) {
    const key = `${card.widthMm.toFixed(2)}x${card.heightMm.toFixed(2)}`;
    const arr = groups.get(key);
    if (arr) arr.push(card);
    else groups.set(key, [card]);
  }

  let doc: jsPDF | null = null;
  let done = 0;
  const total = cards.length;

  for (const group of groups.values()) {
    const cw = group[0].widthMm;
    const ch = group[0].heightMm;

    const { w: paperW, h: paperH } = computeEffectivePaperDims(
      paperWidthMm, paperHeightMm, paperOrientation, cw, ch, pageMarginMm, cardGapMm,
    );
    const { cols, perPage } = computeLayout(paperW, paperH, cw, ch, pageMarginMm, cardGapMm);
    const orientation: 'portrait' | 'landscape' = paperW >= paperH ? 'landscape' : 'portrait';

    for (let i = 0; i < group.length; i++) {
      const posInPage = i % perPage;
      if (posInPage === 0) {
        if (!doc) {
          doc = new jsPDF({ unit: 'mm', format: [paperW, paperH], orientation });
        } else {
          doc.addPage([paperW, paperH], orientation);
        }
      }
      const col = posInPage % cols;
      const row = Math.floor(posInPage / cols);
      const x = pageMarginMm + col * (cw + cardGapMm);
      const y = pageMarginMm + row * (ch + cardGapMm);
      doc!.addImage(group[i].dataUrl, pdfImageFormat(group[i].dataUrl), x, y, cw, ch);

      done += 1;
      onProgress?.(done, total);
    }
  }

  const blob = doc!.output('blob');
  await saveBlob(blob, `${fileName}.pdf`, {
    description: 'PDF Document',
    accept: { 'application/pdf': ['.pdf'] },
  });
}
