import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Template } from '../types';
import type { WorkspaceData } from './workspaceStorage';

// Module-level memCache/persisted state must not leak between tests — every
// test re-imports a fresh instance of the module (see idbStore.test.ts for
// the same pattern applied to a different module).
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function freshAssetStore() {
  return import('./assetStore');
}

/** A data: URL guaranteed to be over the 8KB inline limit. */
function bigDataUrl(seed: string): string {
  return `data:image/png;base64,${seed}${'A'.repeat(9000)}`;
}
const smallDataUrl = 'data:image/png;base64,AAAA';

function baseTemplate(overrides: Partial<Template> = {}): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null, ...overrides };
}

function baseWorkspaceData(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    template: baseTemplate(),
    records: [],
    columnMapping: {},
    printPresets: [],
    printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'portrait' },
    selectedCardIndices: [],
    currentTemplateSource: null,
    ...overrides,
  };
}

describe('isAssetRef', () => {
  it('is true for strings starting with "asset:"', async () => {
    const { isAssetRef } = await freshAssetStore();
    expect(isAssetRef('asset:abc-def-10')).toBe(true);
  });

  it('is false for data URLs, plain strings, and non-strings', async () => {
    const { isAssetRef } = await freshAssetStore();
    expect(isAssetRef('data:image/png;base64,AAAA')).toBe(false);
    expect(isAssetRef('plain text')).toBe(false);
    expect(isAssetRef(null)).toBe(false);
    expect(isAssetRef(42)).toBe(false);
  });
});

describe('storeAssetSync / getAsset', () => {
  it('returns an asset: ref and resolves the same content back via the in-memory cache', async () => {
    const { storeAssetSync, getAsset } = await freshAssetStore();
    const url = bigDataUrl('one');
    const ref = storeAssetSync(url);
    expect(ref.startsWith('asset:')).toBe(true);
    expect(await getAsset(ref)).toBe(url);
  });

  it('is content-addressed: identical content hashes to the same ref', async () => {
    const { storeAssetSync } = await freshAssetStore();
    const url = bigDataUrl('same-content');
    expect(storeAssetSync(url)).toBe(storeAssetSync(url));
  });

  it('different content hashes to different refs', async () => {
    const { storeAssetSync } = await freshAssetStore();
    expect(storeAssetSync(bigDataUrl('a'))).not.toBe(storeAssetSync(bigDataUrl('b')));
  });

  it('getAsset resolves null for a ref that was never stored', async () => {
    const { getAsset } = await freshAssetStore();
    expect(await getAsset('asset:does-not-exist-0')).toBeNull();
  });

  it('persists to IndexedDB so a later, cache-free module instance can still resolve it', async () => {
    const { storeAssetSync } = await freshAssetStore();
    const url = bigDataUrl('persisted-across-sessions');
    const ref = storeAssetSync(url);

    // storeAssetSync fires the IndexedDB write in the background — poll a fresh,
    // cache-free module instance until the write lands instead of guessing a fixed delay.
    await vi.waitFor(async () => {
      vi.resetModules();
      const { getAsset: freshGetAsset } = await freshAssetStore();
      expect(await freshGetAsset(ref)).toBe(url);
    });
  });
});

describe('externalizeTemplateAssets', () => {
  it('externalizes an over-limit background image to a ref', async () => {
    const { externalizeTemplateAssets, isAssetRef } = await freshAssetStore();
    const template = baseTemplate({ background: { type: 'image', value: bigDataUrl('bg') } });
    const out = externalizeTemplateAssets(template);
    expect(isAssetRef(out.background!.value)).toBe(true);
  });

  it('leaves an under-limit background image inline', async () => {
    const { externalizeTemplateAssets } = await freshAssetStore();
    const template = baseTemplate({ background: { type: 'image', value: smallDataUrl } });
    const out = externalizeTemplateAssets(template);
    expect(out.background!.value).toBe(smallDataUrl);
  });

  it('externalizes an over-limit watermark image to a ref', async () => {
    const { externalizeTemplateAssets, isAssetRef } = await freshAssetStore();
    const template = baseTemplate({
      watermark: { type: 'image', value: bigDataUrl('wm'), opacity: 1, position: 'center' },
    });
    const out = externalizeTemplateAssets(template);
    expect(isAssetRef(out.watermark!.value)).toBe(true);
  });

  it('leaves a template with no background/watermark untouched (same reference)', async () => {
    const { externalizeTemplateAssets } = await freshAssetStore();
    const template = baseTemplate();
    expect(externalizeTemplateAssets(template)).toBe(template);
  });

  it('does not re-externalize a value that is already a ref (not a data: URL)', async () => {
    const { externalizeTemplateAssets } = await freshAssetStore();
    const template = baseTemplate({ background: { type: 'image', value: 'asset:already-a-ref-5' } });
    const out = externalizeTemplateAssets(template);
    expect(out.background!.value).toBe('asset:already-a-ref-5');
  });
});

describe('resolveTemplateAssets', () => {
  it('resolves a background ref back to its data URL', async () => {
    const { storeAssetSync, resolveTemplateAssets } = await freshAssetStore();
    const url = bigDataUrl('resolve-bg');
    const ref = storeAssetSync(url);
    const template = baseTemplate({ background: { type: 'image', value: ref } });
    const out = await resolveTemplateAssets(template);
    expect(out.background!.value).toBe(url);
  });

  it('resolves a watermark ref back to its data URL', async () => {
    const { storeAssetSync, resolveTemplateAssets } = await freshAssetStore();
    const url = bigDataUrl('resolve-wm');
    const ref = storeAssetSync(url);
    const template = baseTemplate({ watermark: { type: 'image', value: ref, opacity: 1, position: 'center' } });
    const out = await resolveTemplateAssets(template);
    expect(out.watermark!.value).toBe(url);
  });

  it('drops the background to null and warns when the asset is missing', async () => {
    const { resolveTemplateAssets } = await freshAssetStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const template = baseTemplate({ background: { type: 'image', value: 'asset:missing-0' } });
    const out = await resolveTemplateAssets(template);
    expect(out.background).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('background image asset missing'));
  });

  it('drops the watermark to null and warns when the asset is missing', async () => {
    const { resolveTemplateAssets } = await freshAssetStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const template = baseTemplate({ watermark: { type: 'image', value: 'asset:missing-1', opacity: 1, position: 'center' } });
    const out = await resolveTemplateAssets(template);
    expect(out.watermark).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('watermark image asset missing'));
  });

  it('leaves an inline (non-ref) background/watermark untouched', async () => {
    const { resolveTemplateAssets } = await freshAssetStore();
    const template = baseTemplate({ background: { type: 'solid', value: '#fff' } });
    const out = await resolveTemplateAssets(template);
    expect(out.background!.value).toBe('#fff');
  });
});

describe('externalizeWorkspaceAssets / resolveWorkspaceAssets round trip', () => {
  it('externalizes template background and card override photos, then resolves them back', async () => {
    const { externalizeWorkspaceAssets, resolveWorkspaceAssets, isAssetRef } = await freshAssetStore();
    const bg = bigDataUrl('workspace-bg');
    const photo = bigDataUrl('card-photo');
    const data = baseWorkspaceData({
      template: baseTemplate({ background: { type: 'image', value: bg } }),
      records: [{ id: 'r1', data: {}, overrides: { photo } }],
    });

    const externalized = externalizeWorkspaceAssets(data);
    expect(isAssetRef(externalized.template!.background!.value)).toBe(true);
    expect(isAssetRef(externalized.records![0].overrides.photo!)).toBe(true);

    const resolved = await resolveWorkspaceAssets(externalized);
    expect(resolved.template!.background!.value).toBe(bg);
    expect(resolved.records![0].overrides.photo).toBe(photo);
  });

  it('returns the same object reference when nothing needs externalizing', async () => {
    const { externalizeWorkspaceAssets } = await freshAssetStore();
    const data = baseWorkspaceData();
    expect(externalizeWorkspaceAssets(data)).toBe(data);
  });

  it('keeps individual record references stable when a record has no asset refs to resolve', async () => {
    // resolveRecords always rebuilds the array (Promise.all(records.map(...))), but an
    // unchanged record itself should still be the same object, not a clone.
    const { resolveWorkspaceAssets } = await freshAssetStore();
    const record = { id: 'r1', data: {}, overrides: { name: 'plain value' } };
    const data = baseWorkspaceData({ records: [record] });
    const resolved = await resolveWorkspaceAssets(data);
    expect(resolved.records![0]).toBe(record);
  });

  it('clears a missing card-override asset to null and warns, keyed by field name', async () => {
    const { resolveWorkspaceAssets } = await freshAssetStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = baseWorkspaceData({
      records: [{ id: 'r1', data: {}, overrides: { photo: 'asset:missing-photo-0' } }],
    });
    const resolved = await resolveWorkspaceAssets(data);
    expect(resolved.records![0].overrides.photo).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"photo"'));
  });

  it('leaves records with no asset refs untouched', async () => {
    const { externalizeWorkspaceAssets } = await freshAssetStore();
    const data = baseWorkspaceData({ records: [{ id: 'r1', data: {}, overrides: { name: 'plain value' } }] });
    const out = externalizeWorkspaceAssets(data);
    expect(out.records).toBe(data.records);
  });
});
