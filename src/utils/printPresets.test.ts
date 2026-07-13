import { beforeEach, describe, expect, it } from 'vitest';
import { deletePrintPreset, loadPrintPresets, replacePrintPresets, savePrintPreset } from './printPresets';
import { clearAllStores } from './testHelpers';

beforeEach(async () => {
  await clearAllStores();
});

const preset = (id: string, name: string) => ({
  id,
  name,
  widthMm: 85.6,
  heightMm: 53.98,
  orientation: 'landscape' as const,
});

describe('loadPrintPresets', () => {
  it('is empty before anything is saved', async () => {
    expect(await loadPrintPresets()).toEqual([]);
  });
});

describe('savePrintPreset', () => {
  it('persists a preset keyed by its own id', async () => {
    expect(await savePrintPreset(preset('p1', 'A4 Landscape'))).toBe(true);
    expect(await loadPrintPresets()).toEqual([preset('p1', 'A4 Landscape')]);
  });

  it('upserts when saving the same preset id again', async () => {
    await savePrintPreset(preset('p1', 'v1'));
    await savePrintPreset(preset('p1', 'v2'));
    const all = await loadPrintPresets();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('v2');
  });
});

describe('deletePrintPreset', () => {
  it('removes a single preset, leaving others intact', async () => {
    await savePrintPreset(preset('p1', 'A'));
    await savePrintPreset(preset('p2', 'B'));
    expect(await deletePrintPreset('p1')).toBe(true);
    expect(await loadPrintPresets()).toEqual([preset('p2', 'B')]);
  });
});

describe('replacePrintPresets', () => {
  it('replaces the whole stored list (backup restore)', async () => {
    await savePrintPreset(preset('stale', 'Stale'));
    expect(await replacePrintPresets([preset('r1', 'Restored 1'), preset('r2', 'Restored 2')])).toBe(true);
    const all = await loadPrintPresets();
    expect(all.map((p) => p.id).sort()).toEqual(['r1', 'r2']);
  });

  it('replacing with an empty array clears the store', async () => {
    await savePrintPreset(preset('p1', 'A'));
    await replacePrintPresets([]);
    expect(await loadPrintPresets()).toEqual([]);
  });
});
