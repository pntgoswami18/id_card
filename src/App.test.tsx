import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearAllStores } from './utils/testHelpers';
import { createWorkspace, saveWorkspaceData, getWorkspaceData, getDefaultWorkspaceData } from './utils/workspaceStorage';
import { useAppState, useAppDispatch } from './store/AppStateContext';

// The four wizard steps are lazy-loaded (React.lazy) — replace each with a minimal marker
// that still participates in real AppState, so boot/step-wiring/autosave can be exercised
// without pulling in CardCanvas or any of the other already-tested step internals.
let designStepShouldThrow = false;

vi.mock('./components/DesignStep', () => ({
  default: function DesignStepMock() {
    if (designStepShouldThrow) throw new Error('boom from DesignStep');
    const { template, printSettings } = useAppState();
    const dispatch = useAppDispatch();
    return (
      <div>
        <span>DESIGN_STEP: {template.name}</span>
        <button onClick={() => dispatch({ type: 'SET_PRINT_SETTINGS', payload: { orientation: printSettings.orientation === 'portrait' ? 'landscape' : 'portrait' } })}>
          Make an edit
        </button>
      </div>
    );
  },
}));
vi.mock('./components/DataStep', () => ({
  default: function DataStepMock() {
    const dispatch = useAppDispatch();
    return (
      <div>
        <span>DATA_STEP</span>
        <button onClick={() => dispatch({ type: 'SET_RECORDS', payload: [{ id: 'r1', data: {}, overrides: {} }] })}>
          Add a record
        </button>
      </div>
    );
  },
}));
vi.mock('./components/PreviewStep', () => ({ default: () => <div>PREVIEW_STEP</div> }));
vi.mock('./components/PrintStep', () => ({ default: () => <div>PRINT_STEP</div> }));

vi.mock('./utils/storageMigration', async () => {
  const actual = await vi.importActual<typeof import('./utils/storageMigration')>('./utils/storageMigration');
  return {
    ...actual,
    runMigrationIfNeeded: vi.fn().mockResolvedValue({ degraded: false }),
    getMigrationNoticeIfAny: vi.fn().mockResolvedValue({ checked: true, count: 0 }),
    readLegacyWorkspaceList: vi.fn().mockReturnValue(null),
    readLegacyWorkspaceData: vi.fn().mockReturnValue(null),
  };
});

vi.mock('./utils/workspaceFile', async () => {
  const actual = await vi.importActual<typeof import('./utils/workspaceFile')>('./utils/workspaceFile');
  return {
    ...actual,
    hasSaveFilePicker: vi.fn().mockReturnValue(false),
    hasOpenFilePicker: vi.fn().mockReturnValue(false),
    saveWorkspaceWithPicker: vi.fn().mockResolvedValue(null),
    writeWorkspaceToHandle: vi.fn().mockResolvedValue(true),
    openWorkspaceFilePickerWithHandle: vi.fn().mockResolvedValue(null),
    readWorkspaceFile: vi.fn(),
  };
});

beforeEach(async () => {
  await clearAllStores();
  localStorage.clear();
  designStepShouldThrow = false;
  vi.clearAllMocks();
  const { runMigrationIfNeeded, getMigrationNoticeIfAny, readLegacyWorkspaceList, readLegacyWorkspaceData } = await import('./utils/storageMigration');
  vi.mocked(runMigrationIfNeeded).mockResolvedValue({ degraded: false });
  vi.mocked(getMigrationNoticeIfAny).mockResolvedValue({ checked: true, count: 0 });
  vi.mocked(readLegacyWorkspaceList).mockReturnValue(null);
  vi.mocked(readLegacyWorkspaceData).mockReturnValue(null);
  const { hasSaveFilePicker, hasOpenFilePicker } = await import('./utils/workspaceFile');
  vi.mocked(hasSaveFilePicker).mockReturnValue(false);
  vi.mocked(hasOpenFilePicker).mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('App — boot sequence', () => {
  it('shows the first-launch setup dialog when there are no workspaces', async () => {
    render(<App />);
    expect(await screen.findByText('Welcome to ID Card Generator')).toBeInTheDocument();
  });

  it('loads the current workspace on boot and renders the active step', async () => {
    const meta = await createWorkspace('My Badges');
    await saveWorkspaceData(meta.id, {
      ...getDefaultWorkspaceData(),
      template: { id: 't1', name: 'Custom Template', elements: [], background: null, watermark: null },
    });
    render(<App />);
    expect(await screen.findByText('DESIGN_STEP: Custom Template')).toBeInTheDocument();
    expect(screen.queryByText('Welcome to ID Card Generator')).not.toBeInTheDocument();
  });

  it('shows a degraded-storage error and falls back to the legacy workspace when migration is degraded', async () => {
    const { runMigrationIfNeeded, readLegacyWorkspaceList, readLegacyWorkspaceData } = await import('./utils/storageMigration');
    vi.mocked(runMigrationIfNeeded).mockResolvedValue({ degraded: true });
    vi.mocked(readLegacyWorkspaceList).mockReturnValue({ currentId: 'legacy-1', workspaces: [{ id: 'legacy-1', name: 'Legacy Workspace' }] });
    vi.mocked(readLegacyWorkspaceData).mockReturnValue({
      ...getDefaultWorkspaceData(),
      template: { id: 'legacy-t', name: 'Legacy Template', elements: [], background: null, watermark: null },
    });

    render(<App />);
    expect(await screen.findByText(/storage upgrade could not run/)).toBeInTheDocument();
    expect(await screen.findByText('DESIGN_STEP: Legacy Template')).toBeInTheDocument();
  });

  it('shows the setup dialog when migration is degraded and no legacy data exists either', async () => {
    const { runMigrationIfNeeded } = await import('./utils/storageMigration');
    vi.mocked(runMigrationIfNeeded).mockResolvedValue({ degraded: true });
    render(<App />);
    expect(await screen.findByText(/storage upgrade could not run/)).toBeInTheDocument();
    expect(await screen.findByText('Welcome to ID Card Generator')).toBeInTheDocument();
  });

  it('shows a notice when some legacy items could not be upgraded', async () => {
    const { getMigrationNoticeIfAny } = await import('./utils/storageMigration');
    vi.mocked(getMigrationNoticeIfAny).mockResolvedValue({ checked: true, count: 3 });
    render(<App />);
    expect(await screen.findByText(/3 item\(s\) from your previous browser storage could not be upgraded/)).toBeInTheDocument();
  });

  it('surfaces an error and still resolves the boot gate when an unexpected error is thrown', async () => {
    const workspaceStorage = await import('./utils/workspaceStorage');
    vi.spyOn(workspaceStorage, 'getWorkspaceList').mockRejectedValueOnce(new Error('unexpected'));
    render(<App />);
    expect(await screen.findByText('Something went wrong while loading your saved data. Reload the page to try again.')).toBeInTheDocument();
    // The boot gate still lifted — the app shell rendered instead of being stuck on the spinner.
    expect(screen.getByRole('heading', { name: 'ID Card Generator' })).toBeInTheDocument();
  });
});

describe('App — step wiring', () => {
  it('defaults to the Design step', async () => {
    await createWorkspace('W');
    render(<App />);
    expect(await screen.findByText(/DESIGN_STEP/)).toBeInTheDocument();
  });

  it('clicking a step button navigates to that step', async () => {
    const user = userEvent.setup();
    await createWorkspace('W');
    render(<App />);
    await screen.findByText(/DESIGN_STEP/);
    await user.click(screen.getByRole('button', { name: 'Go to Data step' }));
    expect(await screen.findByText('DATA_STEP')).toBeInTheDocument();
  });

  it('disables Preview/Print steps until there are records', async () => {
    await createWorkspace('W');
    render(<App />);
    await screen.findByText(/DESIGN_STEP/);
    expect(screen.getByRole('button', { name: 'Go to Preview step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to Print step' })).toBeDisabled();
  });

  it('enables Preview/Print once records exist', async () => {
    const user = userEvent.setup();
    await createWorkspace('W');
    render(<App />);
    await screen.findByText(/DESIGN_STEP/);
    await user.click(screen.getByRole('button', { name: 'Go to Data step' }));
    await user.click(await screen.findByRole('button', { name: 'Add a record' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to Preview step' })).toBeEnabled());
  });

  it('StepErrorBoundary catches a step render error and offers Try Again', async () => {
    await createWorkspace('W');
    designStepShouldThrow = true;
    render(<App />);
    expect(await screen.findByText('Something went wrong in this step.')).toBeInTheDocument();
    expect(screen.getByText('boom from DesignStep')).toBeInTheDocument();

    designStepShouldThrow = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText(/DESIGN_STEP/)).toBeInTheDocument();
  });
});

describe('App — autosave', () => {
  it('persists a state change to IndexedDB after the debounce window', async () => {
    const user = userEvent.setup();
    const meta = await createWorkspace('W');
    await saveWorkspaceData(meta.id, getDefaultWorkspaceData());
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Make an edit' }));

    await waitFor(async () => {
      const saved = await getWorkspaceData(meta.id);
      expect(saved?.printSettings.orientation).toBe('landscape');
    }, { timeout: 2000 });
  });

  it('autosaves to the linked file once a handle exists and Autosave is enabled', async () => {
    // NOTE: linking the file via a *new* workspace (rather than "Save Workspace" on the
    // already-active one) deliberately, to route around a real bug found while writing this
    // test — see task_3036fe1d. handleSaveWorkspace's setHandleForRoot never refreshes
    // WorkspaceSwitcher's permissionState (only [currentWorkspaceId, handleRehydrationTick]
    // do), so linking the *currently active* workspace can leave Autosave stuck disabled.
    // Creating a new workspace also dispatches onSetCurrentWorkspace, which does refresh it.
    const { hasSaveFilePicker, saveWorkspaceWithPicker, writeWorkspaceToHandle } = await import('./utils/workspaceFile');
    vi.mocked(hasSaveFilePicker).mockReturnValue(true);
    vi.mocked(saveWorkspaceWithPicker).mockResolvedValue({ name: 'w.idcard', createWritable: vi.fn() });

    const user = userEvent.setup();
    await createWorkspace('Existing');
    render(<App />);
    await screen.findByText(/DESIGN_STEP/);

    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    await user.click(screen.getByRole('menuitem', { name: 'New workspace' }));
    await user.type(await screen.findByLabelText('Name'), 'Linked Workspace');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(saveWorkspaceWithPicker).toHaveBeenCalled());
    await screen.findByText('DESIGN_STEP: Blank');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Workspace' })).not.toBeInTheDocument());

    // getAutoSavePref() defaults to true when nothing is stored yet, so Autosave is already
    // on — confirm the Switch reflects that (enabled + checked) rather than needing to click it.
    await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await waitFor(() => expect(toggle).toBeChecked());
    // MUI's Modal aria-hides everything outside itself while open, so the app heading isn't
    // a valid click target here — close via Escape instead.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Make an edit' }));
    await waitFor(() => expect(writeWorkspaceToHandle).toHaveBeenCalled(), { timeout: 2000 });
  });
});
