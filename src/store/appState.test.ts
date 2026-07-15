import { describe, it, expect } from 'vitest';
import { appReducer, initialState, type AppState } from './appState';
import type { CardRecord, Template, TextElement, ImageElement, LabelElement } from '../types';

function withState(overrides: Partial<AppState>): AppState {
  return { ...initialState, ...overrides };
}

const textElement: TextElement = {
  id: 'el-1', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'name', fontSize: 12,
};
const imageElement: ImageElement = {
  id: 'el-2', type: 'image', x: 0, y: 0, width: 50, height: 20, binding: 'photo',
};
const labelElement: LabelElement = {
  id: 'el-3', type: 'label', x: 0, y: 0, width: 50, height: 20, value: 'Static',
};

const template: Template = {
  id: 'tmpl-1', name: 'Test', elements: [textElement, imageElement, labelElement], background: null, watermark: null,
};

function record(id: string, overrides: CardRecord['overrides'] = {}): CardRecord {
  return { id, data: {}, overrides };
}

describe('appReducer', () => {
  describe('template mutations detach templateLinkedToParent', () => {
    const linked = withState({ template, templateLinkedToParent: true });

    it('SET_TEMPLATE clears templateLinkedToParent', () => {
      const next = appReducer(linked, { type: 'SET_TEMPLATE', payload: template });
      expect(next.templateLinkedToParent).toBe(false);
    });

    it('UPDATE_TEMPLATE_ELEMENTS clears templateLinkedToParent', () => {
      const next = appReducer(linked, { type: 'UPDATE_TEMPLATE_ELEMENTS', payload: [] });
      expect(next.templateLinkedToParent).toBe(false);
    });

    it('UPDATE_TEMPLATE_ELEMENT clears templateLinkedToParent', () => {
      const next = appReducer(linked, {
        type: 'UPDATE_TEMPLATE_ELEMENT',
        payload: { id: 'el-1', updates: { fontSize: 14 } },
      });
      expect(next.templateLinkedToParent).toBe(false);
    });

    it('UPDATE_TEMPLATE_BACKGROUND clears templateLinkedToParent', () => {
      const next = appReducer(linked, { type: 'UPDATE_TEMPLATE_BACKGROUND', payload: null });
      expect(next.templateLinkedToParent).toBe(false);
    });

    it('UPDATE_TEMPLATE_WATERMARK clears templateLinkedToParent', () => {
      const next = appReducer(linked, { type: 'UPDATE_TEMPLATE_WATERMARK', payload: null });
      expect(next.templateLinkedToParent).toBe(false);
    });
  });

  describe('UPDATE_TEMPLATE_ELEMENT field stripping', () => {
    const state = withState({ template });

    it('strips text-only fields when patching an image element', () => {
      const next = appReducer(state, {
        type: 'UPDATE_TEMPLATE_ELEMENT',
        payload: {
          id: 'el-2',
          updates: { fontSize: 20, fontWeight: 'bold', color: '#fff', value: 'nope', objectFit: 'contain' } as never,
        },
      });
      const updated = next.template.elements.find((el) => el.id === 'el-2') as ImageElement;
      expect(updated.objectFit).toBe('contain');
      expect((updated as unknown as Record<string, unknown>).fontSize).toBeUndefined();
      expect((updated as unknown as Record<string, unknown>).fontWeight).toBeUndefined();
      expect((updated as unknown as Record<string, unknown>).color).toBeUndefined();
      expect((updated as unknown as Record<string, unknown>).value).toBeUndefined();
    });

    it('strips value field when patching a non-label, non-image element (text)', () => {
      const next = appReducer(state, {
        type: 'UPDATE_TEMPLATE_ELEMENT',
        payload: { id: 'el-1', updates: { value: 'should be stripped', fontSize: 18 } as never },
      });
      const updated = next.template.elements.find((el) => el.id === 'el-1') as TextElement;
      expect(updated.fontSize).toBe(18);
      expect((updated as unknown as Record<string, unknown>).value).toBeUndefined();
    });

    it('keeps value field when patching a label element', () => {
      const next = appReducer(state, {
        type: 'UPDATE_TEMPLATE_ELEMENT',
        payload: { id: 'el-3', updates: { value: 'Updated label' } },
      });
      const updated = next.template.elements.find((el) => el.id === 'el-3') as LabelElement;
      expect(updated.value).toBe('Updated label');
    });

    it('leaves other elements untouched', () => {
      const next = appReducer(state, {
        type: 'UPDATE_TEMPLATE_ELEMENT',
        payload: { id: 'el-1', updates: { fontSize: 99 } },
      });
      const untouched = next.template.elements.find((el) => el.id === 'el-2');
      expect(untouched).toEqual(imageElement);
    });
  });

  describe('SET_RECORDS', () => {
    it('resets selectedCardIndices', () => {
      const state = withState({ records: [record('a')], selectedCardIndices: [0] });
      const next = appReducer(state, { type: 'SET_RECORDS', payload: [record('a'), record('b')] });
      expect(next.selectedCardIndices).toEqual([]);
      expect(next.records).toHaveLength(2);
    });

    it('clears csvData when payload is empty', () => {
      const state = withState({ csvData: { headers: ['a'], rows: [{ a: '1' }] } });
      const next = appReducer(state, { type: 'SET_RECORDS', payload: [] });
      expect(next.csvData).toBeNull();
    });

    it('keeps csvData when payload is non-empty', () => {
      const csvData = { headers: ['a'], rows: [{ a: '1' }] };
      const state = withState({ csvData });
      const next = appReducer(state, { type: 'SET_RECORDS', payload: [record('a')] });
      expect(next.csvData).toBe(csvData);
    });
  });

  describe('UPDATE_RECORD_OVERRIDES', () => {
    it('merges overrides for the given index', () => {
      const state = withState({ records: [record('a', { photo: 'old.png' }), record('b')] });
      const next = appReducer(state, {
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: 0, overrides: { name: 'New Name' } },
      });
      expect(next.records[0].overrides).toEqual({ photo: 'old.png', name: 'New Name' });
      expect(next.records[1]).toEqual(record('b'));
    });

    it('is a no-op when index is out of bounds', () => {
      const state = withState({ records: [record('a')] });
      const next = appReducer(state, {
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: 5, overrides: { name: 'X' } },
      });
      expect(next.records).toEqual(state.records);
    });

    it('merges fontSizeOverrides and prunes null values (reset-to-auto)', () => {
      const state = withState({
        records: [{ ...record('a'), fontSizeOverrides: { name: 14, title: 10 } }],
      });
      const next = appReducer(state, {
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: 0, overrides: {}, fontSizeOverrides: { name: null, subtitle: 8 } },
      });
      expect(next.records[0].fontSizeOverrides).toEqual({ title: 10, subtitle: 8 });
    });

    it('sets fontSizeOverrides to undefined when all entries are pruned', () => {
      const state = withState({
        records: [{ ...record('a'), fontSizeOverrides: { name: 14 } }],
      });
      const next = appReducer(state, {
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: 0, overrides: {}, fontSizeOverrides: { name: null } },
      });
      expect(next.records[0].fontSizeOverrides).toBeUndefined();
    });

    it('leaves fontSizeOverrides untouched when fontSizeOverrides is not passed', () => {
      const state = withState({
        records: [{ ...record('a'), fontSizeOverrides: { name: 14 } }],
      });
      const next = appReducer(state, {
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: 0, overrides: { name: 'X' } },
      });
      expect(next.records[0].fontSizeOverrides).toEqual({ name: 14 });
    });
  });

  describe('SET_PRINT_SETTINGS partial merge', () => {
    it('merges into existing settings instead of replacing', () => {
      const state = withState({
        printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'portrait', pageMarginMm: 5 },
      });
      const next = appReducer(state, { type: 'SET_PRINT_SETTINGS', payload: { orientation: 'landscape' } });
      expect(next.printSettings).toEqual({
        widthMm: 85.6, heightMm: 53.98, orientation: 'landscape', pageMarginMm: 5,
      });
    });
  });

  describe('selection actions', () => {
    const state = withState({ records: [record('a'), record('b'), record('c')] });

    it('SET_SELECTED_CARD_INDICES sets exactly', () => {
      const next = appReducer(state, { type: 'SET_SELECTED_CARD_INDICES', payload: [1, 2] });
      expect(next.selectedCardIndices).toEqual([1, 2]);
    });

    it('TOGGLE_CARD_SELECTION adds an unselected index', () => {
      const next = appReducer(withState({ selectedCardIndices: [0] }), {
        type: 'TOGGLE_CARD_SELECTION', payload: 1,
      });
      expect(next.selectedCardIndices.sort()).toEqual([0, 1]);
    });

    it('TOGGLE_CARD_SELECTION removes a selected index', () => {
      const next = appReducer(withState({ selectedCardIndices: [0, 1] }), {
        type: 'TOGGLE_CARD_SELECTION', payload: 1,
      });
      expect(next.selectedCardIndices).toEqual([0]);
    });

    it('SELECT_ALL_CARDS selects every record index', () => {
      const next = appReducer(state, { type: 'SELECT_ALL_CARDS' });
      expect(next.selectedCardIndices).toEqual([0, 1, 2]);
    });

    it('DESELECT_ALL_CARDS clears selection', () => {
      const next = appReducer(withState({ selectedCardIndices: [0, 1] }), { type: 'DESELECT_ALL_CARDS' });
      expect(next.selectedCardIndices).toEqual([]);
    });
  });

  describe('LOAD_WORKSPACE_STATE', () => {
    it('sets activeStep to 2 when records and columnMapping are both present', () => {
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { records: [record('a')], columnMapping: { name: 'Name' } },
      });
      expect(next.activeStep).toBe(2);
    });

    it('sets activeStep to 0 when records are present but columnMapping is empty', () => {
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { records: [record('a')], columnMapping: {} },
      });
      expect(next.activeStep).toBe(0);
    });

    it('restores csvData when present in the payload, including null', () => {
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { csvData: null },
      });
      expect(next.csvData).toBeNull();
    });

    it('restores a real csvData value when present in the payload', () => {
      const csvData = { headers: ['a'], rows: [{ a: '1' }] };
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { csvData },
      });
      expect(next.csvData).toEqual(csvData);
    });

    it('sets csvData to null when the key is absent from the payload (not kept from prior state)', () => {
      const priorState = withState({ csvData: { headers: ['x'], rows: [{ x: '1' }] } });
      const next = appReducer(priorState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { records: [record('a')] },
      });
      expect(next.csvData).toBeNull();
    });

    it('does not touch currentTemplateSource when absent from the payload', () => {
      const priorState = withState({ currentTemplateSource: { type: 'user', id: 'u1' } });
      const next = appReducer(priorState, { type: 'LOAD_WORKSPACE_STATE', payload: {} });
      expect(next.currentTemplateSource).toEqual({ type: 'user', id: 'u1' });
    });

    it('restores currentTemplateSource to null when explicitly set to null in the payload', () => {
      const priorState = withState({ currentTemplateSource: { type: 'user', id: 'u1' } });
      const next = appReducer(priorState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { currentTemplateSource: null },
      });
      expect(next.currentTemplateSource).toBeNull();
    });

    it('defaults templateLinkedToParent to false when absent from the payload', () => {
      const priorState = withState({ templateLinkedToParent: true });
      const next = appReducer(priorState, { type: 'LOAD_WORKSPACE_STATE', payload: {} });
      expect(next.templateLinkedToParent).toBe(false);
    });

    it('restores templateLinkedToParent when present in the payload', () => {
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { templateLinkedToParent: true },
      });
      expect(next.templateLinkedToParent).toBe(true);
    });

    it('only applies fields present in the payload, leaving others as prior state', () => {
      const priorState = withState({ template, printPresets: [{ id: 'p1', name: 'A4', widthMm: 85.6, heightMm: 53.98, orientation: 'portrait' }] });
      const next = appReducer(priorState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { records: [record('a')] },
      });
      expect(next.template).toBe(template);
      expect(next.printPresets).toEqual(priorState.printPresets);
    });

    it('restores currentWorkspaceLogo when "logo" key is present in the payload', () => {
      const next = appReducer(initialState, {
        type: 'LOAD_WORKSPACE_STATE',
        payload: { logo: 'data:image/png;base64,xyz' },
      });
      expect(next.currentWorkspaceLogo).toBe('data:image/png;base64,xyz');
    });
  });

  describe('unknown action', () => {
    it('returns state unchanged', () => {
      const state = withState({ activeStep: 3 });
      const next = appReducer(state, { type: 'UNKNOWN' } as never);
      expect(next).toBe(state);
    });
  });
});
