import JSZip from 'jszip';
import type { CardImage } from './aggregatePdf';
import type { ExportManifest } from './exportImages';

export type ImportResult = {
  /** Cards whose mm size was recovered from a ZIP manifest. */
  sized: CardImage[];
  /** Images with no known size (loose files, or ZIPs without a manifest). */
  unsized: { dataUrl: string }[];
  warnings: string[];
};

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isImageName(name: string): boolean {
  return extOf(name) in IMAGE_EXT_TO_MIME;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function isValidManifest(m: unknown): m is ExportManifest {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return typeof o.cardWidthMm === 'number' && typeof o.cardHeightMm === 'number';
}

/**
 * Reads the picked files into card images. ZIPs produced by the image export
 * carry a `manifest.json` with the card's mm size, so those cards come back
 * fully sized. Loose images (and manifest-less ZIPs) come back as `unsized`,
 * and the caller must supply dimensions before aggregating.
 */
export async function importCardsFromFiles(files: File[]): Promise<ImportResult> {
  const sized: CardImage[] = [];
  const unsized: { dataUrl: string }[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const ext = extOf(file.name);

    if (ext === 'zip') {
      try {
        const zip = await JSZip.loadAsync(file);

        let manifest: ExportManifest | null = null;
        const manifestFile = zip.file('manifest.json');
        if (manifestFile) {
          try {
            const parsed = JSON.parse(await manifestFile.async('string'));
            if (isValidManifest(parsed)) manifest = parsed;
          } catch {
            // Malformed manifest — treat the ZIP's images as unsized.
          }
        }

        const imageEntries = Object.values(zip.files)
          .filter((e) => !e.dir && isImageName(e.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        if (imageEntries.length === 0) {
          warnings.push(`${file.name}: no images found in archive.`);
          continue;
        }

        for (const entry of imageEntries) {
          const mime = IMAGE_EXT_TO_MIME[extOf(entry.name)];
          const base64 = await entry.async('base64');
          const dataUrl = `data:${mime};base64,${base64}`;
          if (manifest) {
            sized.push({ dataUrl, widthMm: manifest.cardWidthMm, heightMm: manifest.cardHeightMm });
          } else {
            unsized.push({ dataUrl });
          }
        }

        if (!manifest) {
          warnings.push(`${file.name}: no manifest — set the card size manually.`);
        }
      } catch {
        warnings.push(`${file.name}: could not read ZIP archive.`);
      }
    } else if (isImageName(file.name)) {
      try {
        unsized.push({ dataUrl: await readFileAsDataUrl(file) });
      } catch {
        warnings.push(`${file.name}: could not read image.`);
      }
    } else {
      warnings.push(`${file.name}: unsupported file type (use .zip, .png, or .jpg).`);
    }
  }

  return { sized, unsized, warnings };
}
