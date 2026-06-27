// Shared "save a Blob to disk" helper. Uses the File System Access API save
// picker when available (Chrome/Edge) and falls back to an <a download> click
// everywhere else. FSA types are not in lib.dom — see workspaceFile.ts.

type SavePickerOpts = {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
};
type FSWritable = { write(data: BufferSource | Blob | string): Promise<void>; close(): Promise<void> };
type FSFileHandle = { createWritable(): Promise<FSWritable> };

/**
 * Saves `blob` as `fileName`. `accept` describes the file type for the FSA picker
 * (e.g. `{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }`).
 * Returns true if saved, false if the user cancelled the FSA picker.
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
  accept: { description?: string; accept: Record<string, string[]> },
): Promise<boolean> {
  const win = window as Window & {
    showSaveFilePicker?: (opts?: SavePickerOpts) => Promise<FSFileHandle>;
  };

  if (win.showSaveFilePicker) {
    try {
      const fileHandle = await win.showSaveFilePicker({
        suggestedName: fileName,
        types: [accept],
      });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
      return true;
    } catch (err) {
      // User cancelled the picker — abort silently.
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      // Fall through to legacy download on other errors.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation so the browser has time to initiate the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Slugifies a name for use in a download filename. */
export function safeFileName(name: string, fallback = 'cards'): string {
  const safe = name
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || fallback;
}
