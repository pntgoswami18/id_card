import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// @testing-library/react only auto-registers its afterEach(cleanup) when it
// detects `afterEach` as a real global (i.e. `test.globals: true`). This repo
// imports describe/it/expect/etc. explicitly instead of using Vitest globals,
// so without this, unmounted component trees (and any Portal-rendered content,
// e.g. MUI Dialog/Select) would leak into the next test in the same file.
afterEach(() => {
  cleanup();
});

// jsdom's Blob/File implementation doesn't include text()/arrayBuffer() (as of
// jsdom 24) — polyfill via FileReader, which jsdom does implement, so product
// code that calls file.text() (e.g. workspaceFile.ts's readWorkspaceFile) works
// under test the same as it does in a real browser.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsText(this);
    });
  };
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsArrayBuffer(this);
    });
  };
}
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}

// jsdom does not implement the CSS Font Loading API (document.fonts). Product
// code (exportImages.ts's waitForContainerReady) awaits document.fonts.ready
// before capturing a card — stub it resolved so that wait is a no-op under test.
if (typeof document.fonts === 'undefined') {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

// jsdom does not implement ResizeObserver. CardCanvas uses it to re-measure
// FitText on layout changes; a no-op stub is enough since jsdom never actually
// resizes anything under test.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
