import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveBlob, safeFileName } from './saveFile';

describe('safeFileName', () => {
  it('replaces non-alphanumeric characters with underscores', () => {
    expect(safeFileName('My Cards (2024)!')).toBe('My_Cards_2024');
  });

  it('collapses consecutive underscores but leaves hyphen runs alone', () => {
    // Spaces are replaced with underscores and then collapsed; hyphens are an
    // allowed character in the regex, so runs of them pass through untouched.
    expect(safeFileName('a   b---c')).toBe('a_b---c');
  });

  it('trims leading and trailing underscores', () => {
    expect(safeFileName('___leading and trailing___')).toBe('leading_and_trailing');
  });

  it('falls back to the default when the result is empty', () => {
    expect(safeFileName('!!!')).toBe('cards');
  });

  it('uses a custom fallback when given', () => {
    expect(safeFileName('///', 'workspace')).toBe('workspace');
  });

  it('preserves hyphens and underscores already present', () => {
    expect(safeFileName('valid-name_123')).toBe('valid-name_123');
  });
});

describe('saveBlob', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('uses the FSA save picker when available and returns true on success', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = showSaveFilePicker;

    const blob = new Blob(['data']);
    const result = await saveBlob(blob, 'out.pdf', { accept: { 'application/pdf': ['.pdf'] } });

    expect(result).toBe(true);
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'out.pdf' }),
    );
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
  });

  it('returns false when the user cancels the FSA picker (AbortError)', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = showSaveFilePicker;

    const result = await saveBlob(new Blob(['data']), 'out.pdf', { accept: { 'application/pdf': ['.pdf'] } });
    expect(result).toBe(false);
  });

  it('falls back to <a download> when FSA is unavailable', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveBlob(new Blob(['data']), 'out.pdf', { accept: { 'application/pdf': ['.pdf'] } });

    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('falls through to the download fallback when the FSA picker throws a non-abort error', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new Error('permission denied'));
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = showSaveFilePicker;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveBlob(new Blob(['data']), 'out.pdf', { accept: { 'application/pdf': ['.pdf'] } });

    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
