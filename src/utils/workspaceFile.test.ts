import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isWorkspaceFile,
  isTemplateFile,
  hasSaveFilePicker,
  hasOpenFilePicker,
  writeWorkspaceToHandle,
  deleteWorkspaceFile,
  requestRemovePermission,
  pickSaveFileHandle,
  saveWorkspaceWithPicker,
  downloadWorkspaceFile,
  openWorkspaceWithPicker,
  openWorkspaceFilePicker,
  openWorkspaceFilePickerWithHandle,
  readWorkspaceFile,
  saveTemplateWithPicker,
  readTemplateFile,
  getAutoSavePref,
  setAutoSavePref,
  type WorkspaceFileHandle,
} from './workspaceFile';
import type { WorkspaceData } from './workspaceStorage';
import type { Template } from '../types';

function baseWorkspaceData(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    template: { id: 't1', name: 'T', elements: [], background: null, watermark: null },
    records: [],
    columnMapping: {},
    printPresets: [],
    printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'portrait' },
    selectedCardIndices: [],
    currentTemplateSource: null,
    ...overrides,
  };
}

function baseTemplate(overrides: Partial<Template> = {}): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null, ...overrides };
}

type WinWithFSA = Window & {
  showSaveFilePicker?: unknown;
  showOpenFilePicker?: unknown;
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as WinWithFSA).showSaveFilePicker;
  delete (window as WinWithFSA).showOpenFilePicker;
  localStorage.clear();
});

describe('isWorkspaceFile', () => {
  it('accepts a well-formed workspace file', () => {
    expect(isWorkspaceFile({
      version: 1, app: 'id_card_generator', type: 'workspace', savedAt: 'x', name: 'W', data: {},
    })).toBe(true);
  });

  it.each([
    ['null', null],
    ['non-object', 'string'],
    ['wrong version', { version: 2, app: 'id_card_generator', type: 'workspace', name: 'W', data: {} }],
    ['wrong app', { version: 1, app: 'other', type: 'workspace', name: 'W', data: {} }],
    ['wrong type', { version: 1, app: 'id_card_generator', type: 'template', name: 'W', data: {} }],
    ['non-string name', { version: 1, app: 'id_card_generator', type: 'workspace', name: 5, data: {} }],
    ['name too long', { version: 1, app: 'id_card_generator', type: 'workspace', name: 'x'.repeat(501), data: {} }],
    ['missing data', { version: 1, app: 'id_card_generator', type: 'workspace', name: 'W' }],
  ])('rejects %s', (_label, value) => {
    expect(isWorkspaceFile(value)).toBe(false);
  });
});

describe('isTemplateFile', () => {
  it('accepts a well-formed template file', () => {
    expect(isTemplateFile({
      version: 1, app: 'id_card_generator', type: 'template', savedAt: 'x', name: 'T', template: {},
    })).toBe(true);
  });

  it('rejects a workspace file shape', () => {
    expect(isTemplateFile({
      version: 1, app: 'id_card_generator', type: 'workspace', name: 'T', template: {},
    })).toBe(false);
  });

  it('rejects a missing template field', () => {
    expect(isTemplateFile({ version: 1, app: 'id_card_generator', type: 'template', name: 'T' })).toBe(false);
  });
});

describe('capability detection', () => {
  it('hasSaveFilePicker reflects whether window.showSaveFilePicker is a function', () => {
    expect(hasSaveFilePicker()).toBe(false);
    (window as WinWithFSA).showSaveFilePicker = () => {};
    expect(hasSaveFilePicker()).toBe(true);
  });

  it('hasOpenFilePicker reflects whether window.showOpenFilePicker is a function', () => {
    expect(hasOpenFilePicker()).toBe(false);
    (window as WinWithFSA).showOpenFilePicker = () => {};
    expect(hasOpenFilePicker()).toBe(true);
  });
});

describe('writeWorkspaceToHandle', () => {
  it('writes the serialized workspace and returns true on success', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: async () => ({ write, close }) };

    const ok = await writeWorkspaceToHandle(handle, 'My Workspace', baseWorkspaceData());
    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(write.mock.calls[0][0]);
    expect(written.name).toBe('My Workspace');
    expect(written.type).toBe('workspace');
    expect(close).toHaveBeenCalled();
  });

  it('strips csvData from the root workspace before writing', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: async () => ({ write, close: vi.fn() }) };
    await writeWorkspaceToHandle(handle, 'W', baseWorkspaceData({ csvData: { headers: ['a'], rows: [{ a: '1' }] } }));
    const written = JSON.parse(write.mock.calls[0][0]);
    expect(written.data.csvData).toBeUndefined();
  });

  it('strips csvData from every child workspace before writing', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: async () => ({ write, close: vi.fn() }) };
    await writeWorkspaceToHandle(handle, 'W', baseWorkspaceData(), [
      { meta: { name: 'Child' }, data: baseWorkspaceData({ csvData: { headers: [], rows: [] } }) },
    ]);
    const written = JSON.parse(write.mock.calls[0][0]);
    expect(written.children[0].data.csvData).toBeUndefined();
  });

  it('returns false and still closes the writable when write() throws', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: async () => ({ write: vi.fn().mockRejectedValue(new Error('disk full')), close }),
    };
    const ok = await writeWorkspaceToHandle(handle, 'W', baseWorkspaceData());
    expect(ok).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it('returns false when createWritable itself throws', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: async () => { throw new Error('permission denied'); },
    };
    expect(await writeWorkspaceToHandle(handle, 'W', baseWorkspaceData())).toBe(false);
  });
});

describe('requestRemovePermission', () => {
  it('returns false when the handle does not support remove()', async () => {
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: vi.fn() };
    expect(await requestRemovePermission(handle)).toBe(false);
  });

  it('requests readwrite permission and returns true when granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard', createWritable: vi.fn(), requestPermission, remove: vi.fn(),
    };
    expect(await requestRemovePermission(handle)).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('returns true without requesting when the handle has no requestPermission', async () => {
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: vi.fn(), remove: vi.fn() };
    expect(await requestRemovePermission(handle)).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: vi.fn(),
      requestPermission: vi.fn().mockResolvedValue('denied'),
      remove: vi.fn(),
    };
    expect(await requestRemovePermission(handle)).toBe(false);
  });

  it('returns false when requestPermission throws', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: vi.fn(),
      requestPermission: vi.fn().mockRejectedValue(new Error('nope')),
      remove: vi.fn(),
    };
    expect(await requestRemovePermission(handle)).toBe(false);
  });
});

describe('deleteWorkspaceFile', () => {
  it('returns false when the handle does not support remove()', async () => {
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: vi.fn() };
    expect(await deleteWorkspaceFile(handle)).toBe(false);
  });

  it('removes the file and returns true', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = { name: 'w.idcard', createWritable: vi.fn(), remove };
    expect(await deleteWorkspaceFile(handle)).toBe(true);
    expect(remove).toHaveBeenCalled();
  });

  it('treats a NotFoundError from remove() as success (already gone)', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: vi.fn(),
      remove: vi.fn().mockRejectedValue(new DOMException('gone', 'NotFoundError')),
    };
    expect(await deleteWorkspaceFile(handle)).toBe(true);
  });

  it('returns false when remove() throws a non-NotFoundError', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'w.idcard',
      createWritable: vi.fn(),
      remove: vi.fn().mockRejectedValue(new DOMException('nope', 'NoModificationAllowedError')),
    };
    expect(await deleteWorkspaceFile(handle)).toBe(false);
  });
});

describe('pickSaveFileHandle', () => {
  it('returns null without opening a picker when FSA is unavailable', async () => {
    const result = await pickSaveFileHandle('My Workspace');
    expect(result).toBeNull();
  });

  it('returns the acquired handle on success, without writing anything', async () => {
    const write = vi.fn();
    const handle: WorkspaceFileHandle = { name: 'my.idcard', createWritable: async () => ({ write, close: vi.fn() }) };
    const picker = vi.fn().mockResolvedValue(handle);
    (window as WinWithFSA).showSaveFilePicker = picker;

    const result = await pickSaveFileHandle('My Workspace');
    expect(result).toBe(handle);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'My_Workspace.idcard' }));
    expect(write).not.toHaveBeenCalled();
  });

  it('returns null without logging when the user cancels (AbortError)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const result = await pickSaveFileHandle('W');
    expect(result).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs when the picker fails for a non-abort reason', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await pickSaveFileHandle('W');
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('saveWorkspaceWithPicker', () => {
  it('falls back to download when FSA is unavailable', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveWorkspaceWithPicker('My Workspace', baseWorkspaceData());
    expect(result).toBeNull();
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('uses the FSA picker and returns the handle on success', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const handle: WorkspaceFileHandle = { name: 'my.idcard', createWritable: async () => ({ write, close }) };
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockResolvedValue(handle);

    const result = await saveWorkspaceWithPicker('My Workspace', baseWorkspaceData());
    expect(result).toBe(handle);
    expect(write).toHaveBeenCalled();
  });

  it('returns null without logging when the user cancels (AbortError)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const result = await saveWorkspaceWithPicker('W', baseWorkspaceData());
    expect(result).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs when the picker fails for a non-abort reason', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await saveWorkspaceWithPicker('W', baseWorkspaceData());
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns null when the handle acquired but the write itself fails', async () => {
    const handle: WorkspaceFileHandle = {
      name: 'my.idcard',
      createWritable: async () => { throw new Error('nope'); },
    };
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockResolvedValue(handle);
    expect(await saveWorkspaceWithPicker('W', baseWorkspaceData())).toBeNull();
  });
});

describe('downloadWorkspaceFile', () => {
  it('creates an object URL, clicks a download anchor, and revokes the URL', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadWorkspaceFile('My Workspace!', baseWorkspaceData());

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('openWorkspaceWithPicker', () => {
  it('returns null when FSA is unavailable', async () => {
    expect(await openWorkspaceWithPicker()).toBeNull();
  });

  it('reads and parses the picked file', async () => {
    const fileContent = JSON.stringify({
      version: 1, app: 'id_card_generator', type: 'workspace', savedAt: 'x', name: 'W', data: {},
    });
    const file = new File([fileContent], 'w.idcard');
    (window as WinWithFSA).showOpenFilePicker = vi.fn().mockResolvedValue([
      { name: 'w.idcard', createWritable: vi.fn(), getFile: async () => file },
    ]);
    const result = await openWorkspaceWithPicker();
    expect(result?.name).toBe('W');
  });

  it('returns null without logging when the user cancels (AbortError)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showOpenFilePicker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    expect(await openWorkspaceWithPicker()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('openWorkspaceFilePicker / openWorkspaceFilePickerWithHandle', () => {
  it('both return null when FSA is unavailable', async () => {
    expect(await openWorkspaceFilePicker()).toBeNull();
    expect(await openWorkspaceFilePickerWithHandle()).toBeNull();
  });

  it('openWorkspaceFilePickerWithHandle returns both the file and the handle', async () => {
    const file = new File(['{}'], 'w.idcard');
    const fsaHandle = { name: 'w.idcard', createWritable: vi.fn(), getFile: async () => file };
    (window as WinWithFSA).showOpenFilePicker = vi.fn().mockResolvedValue([fsaHandle]);
    const result = await openWorkspaceFilePickerWithHandle();
    expect(result?.file).toBe(file);
    expect(result?.handle).toBe(fsaHandle);
  });

  it('openWorkspaceFilePicker returns just the file', async () => {
    const file = new File(['{}'], 'w.idcard');
    (window as WinWithFSA).showOpenFilePicker = vi.fn().mockResolvedValue([
      { name: 'w.idcard', createWritable: vi.fn(), getFile: async () => file },
    ]);
    expect(await openWorkspaceFilePicker()).toBe(file);
  });
});

describe('readWorkspaceFile', () => {
  it('parses a valid workspace file', async () => {
    const file = new File([JSON.stringify({
      version: 1, app: 'id_card_generator', type: 'workspace', savedAt: 'x', name: 'W', data: {},
    })], 'w.idcard');
    const result = await readWorkspaceFile(file);
    expect(result?.name).toBe('W');
  });

  it('returns null for malformed JSON', async () => {
    const file = new File(['not json'], 'w.idcard');
    expect(await readWorkspaceFile(file)).toBeNull();
  });

  it('returns null for valid JSON that is not a workspace file', async () => {
    const file = new File([JSON.stringify({ foo: 'bar' })], 'w.idcard');
    expect(await readWorkspaceFile(file)).toBeNull();
  });
});

describe('saveTemplateWithPicker', () => {
  it('falls back to download when FSA is unavailable and returns true', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveTemplateWithPicker('My Template', baseTemplate());
    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('uses the FSA picker and returns true on success', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockResolvedValue({
      name: 't.idtemplate', createWritable: async () => ({ write, close }),
    });
    const result = await saveTemplateWithPicker('My Template', baseTemplate());
    expect(result).toBe(true);
    expect(write).toHaveBeenCalled();
    const written = JSON.parse(write.mock.calls[0][0]);
    expect(written.type).toBe('template');
    expect(written.name).toBe('My Template');
  });

  it('returns false without logging when the user cancels (AbortError)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    expect(await saveTemplateWithPicker('T', baseTemplate())).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('resolves asset refs in the template before writing (self-contained file)', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    (window as WinWithFSA).showSaveFilePicker = vi.fn().mockResolvedValue({
      name: 't.idtemplate', createWritable: async () => ({ write, close: vi.fn() }),
    });
    // A background that's already an asset: ref with nothing behind it should resolve
    // to null rather than being written out as a dangling reference.
    const template = baseTemplate({ background: { type: 'image', value: 'asset:missing-0' } });
    await saveTemplateWithPicker('T', template);
    const written = JSON.parse(write.mock.calls[0][0]);
    expect(written.template.background).toBeNull();
  });
});

describe('readTemplateFile', () => {
  it('parses a valid template file', async () => {
    const file = new File([JSON.stringify({
      version: 1, app: 'id_card_generator', type: 'template', savedAt: 'x', name: 'T', template: {},
    })], 't.idtemplate');
    const result = await readTemplateFile(file);
    expect(result?.name).toBe('T');
  });

  it('returns null for malformed JSON', async () => {
    expect(await readTemplateFile(new File(['{bad'], 't.idtemplate'))).toBeNull();
  });
});

describe('autosave preference', () => {
  it('defaults to true when nothing is stored', () => {
    expect(getAutoSavePref()).toBe(true);
  });

  it('round-trips false', () => {
    setAutoSavePref(false);
    expect(getAutoSavePref()).toBe(false);
  });

  it('round-trips true explicitly', () => {
    setAutoSavePref(false);
    setAutoSavePref(true);
    expect(getAutoSavePref()).toBe(true);
  });

  it('getAutoSavePref falls back to true when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getAutoSavePref()).toBe(true);
    spy.mockRestore();
  });

  it('setAutoSavePref does not throw when localStorage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => setAutoSavePref(false)).not.toThrow();
    spy.mockRestore();
  });
});
