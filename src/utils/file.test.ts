import { describe, it, expect } from 'vitest';
import { readFileAsDataUrl } from './file';

describe('readFileAsDataUrl', () => {
  it('resolves with a data URL for the file contents', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const result = await readFileAsDataUrl(file);
    expect(result).toMatch(/^data:text\/plain;base64,/);
  });

  it('rejects when FileReader errors', async () => {
    const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      const err = new DOMException('boom', 'NotReadableError');
      // Simulate an async failure the same way a real read error would fire.
      setTimeout(() => {
        Object.defineProperty(this, 'error', { value: err, configurable: true });
        this.onerror?.(new ProgressEvent('error'));
      }, 0);
    };
    try {
      const file = new File(['x'], 'x.txt');
      await expect(readFileAsDataUrl(file)).rejects.toThrow('boom');
    } finally {
      FileReader.prototype.readAsDataURL = originalReadAsDataURL;
    }
  });
});
