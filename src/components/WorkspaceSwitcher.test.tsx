import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { clearAllStores } from '../utils/testHelpers';
import { getWorkspaceList, createWorkspace } from '../utils/workspaceStorage';
import type { WorkspaceMeta, WorkspaceData } from '../utils/workspaceStorage';
import type { WorkspaceFileHandle } from '../utils/workspaceFile';

vi.mock('../utils/workspaceFile', async () => {
  const actual = await vi.importActual<typeof import('../utils/workspaceFile')>('../utils/workspaceFile');
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

function Harness({ initialList, initialCurrentId, onSaveCurrent, needsSetup, onSetupDone }: {
  initialList: WorkspaceMeta[];
  initialCurrentId: string;
  onSaveCurrent?: () => Promise<void>;
  needsSetup?: boolean;
  onSetupDone?: () => void;
}) {
  const [workspaceList, setWorkspaceList] = useState(initialList);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(initialCurrentId);
  const [currentWorkspaceLogo, setCurrentWorkspaceLogo] = useState<string | undefined>();
  const [autoSaveToFile, setAutoSaveToFile] = useState(false);
  const fileHandleRef = useRef(new Map<string, WorkspaceFileHandle>());
  const [loadedData, setLoadedData] = useState<WorkspaceData | null>(null);

  return (
    <>
      <WorkspaceSwitcher
        workspaceList={workspaceList}
        currentWorkspaceId={currentWorkspaceId}
        currentWorkspaceLogo={currentWorkspaceLogo}
        autoSaveToFile={autoSaveToFile}
        onAutoSaveToFileChange={setAutoSaveToFile}
        fileHandleRef={fileHandleRef}
        handleRehydrationTick={0}
        onSaveCurrent={onSaveCurrent ?? (async () => {})}
        onLoadWorkspace={setLoadedData}
        onSetCurrentWorkspace={setCurrentWorkspaceId}
        onSetWorkspaceList={setWorkspaceList}
        onSetWorkspaceLogo={setCurrentWorkspaceLogo}
        needsSetup={needsSetup}
        onSetupDone={onSetupDone}
      />
      <div
        data-testid="probe"
        data-current-id={currentWorkspaceId}
        data-list={JSON.stringify(workspaceList)}
        data-loaded-template-linked={String(loadedData?.templateLinkedToParent ?? false)}
        data-loaded-orientation={loadedData?.printSettings?.orientation ?? ''}
      />
    </>
  );
}

function probe() {
  return screen.getByTestId('probe');
}
function probeList(): WorkspaceMeta[] {
  return JSON.parse(probe().getAttribute('data-list')!);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Switch workspace' }));
}

beforeEach(async () => {
  await clearAllStores();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkspaceSwitcher — creating a workspace (non-FSA fallback)', () => {
  it('creates a new workspace, adds it to the list, and switches to it', async () => {
    const user = userEvent.setup();
    const meta = await createWorkspace('Existing');
    render(<Harness initialList={[meta]} initialCurrentId={meta.id} />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'New workspace' }));
    await user.type(await screen.findByLabelText('Name'), 'Conference Badges');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(probeList().some((w) => w.name === 'Conference Badges')).toBe(true));
    const created = probeList().find((w) => w.name === 'Conference Badges')!;
    expect(probe()).toHaveAttribute('data-current-id', created.id);
  });

  it('does not create a workspace with a blank name', async () => {
    const user = userEvent.setup();
    const meta = await createWorkspace('Existing');
    render(<Harness initialList={[meta]} initialCurrentId={meta.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'New workspace' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});

describe('WorkspaceSwitcher — sub-workspaces (copy-on-write)', () => {
  it('inherits the parent template/print settings and sets templateLinkedToParent', async () => {
    const user = userEvent.setup();
    const parent = await createWorkspace('Parent');
    const { saveWorkspaceData } = await import('../utils/workspaceStorage');
    await saveWorkspaceData(parent.id, {
      template: { id: 'pt', name: 'Parent Template', elements: [], background: null, watermark: null },
      records: [], columnMapping: {}, printPresets: [],
      printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' },
      selectedCardIndices: [], currentTemplateSource: { type: 'user', id: 'pt' },
    });

    render(<Harness initialList={[parent]} initialCurrentId={parent.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Add sub-workspace' }));
    await user.type(await screen.findByLabelText('Name'), 'VIP');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(probe()).toHaveAttribute('data-loaded-template-linked', 'true'));
    expect(probe()).toHaveAttribute('data-loaded-orientation', 'landscape');
    expect(probeList().some((w) => w.name === 'VIP' && w.parentId === parent.id)).toBe(true);
  });
});

describe('WorkspaceSwitcher — switching', () => {
  it('switching workspaces calls onSaveCurrent and updates currentWorkspaceId', async () => {
    const user = userEvent.setup();
    const onSaveCurrent = vi.fn().mockResolvedValue(undefined);
    const a = await createWorkspace('A');
    const b = await createWorkspace('B');
    render(<Harness initialList={[a, b]} initialCurrentId={a.id} onSaveCurrent={onSaveCurrent} />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'B' }));

    await waitFor(() => expect(probe()).toHaveAttribute('data-current-id', b.id));
    expect(onSaveCurrent).toHaveBeenCalled();
  });

  it('clicking the already-active workspace just closes the menu (no-op switch)', async () => {
    const user = userEvent.setup();
    const onSaveCurrent = vi.fn().mockResolvedValue(undefined);
    const a = await createWorkspace('A');
    render(<Harness initialList={[a]} initialCurrentId={a.id} onSaveCurrent={onSaveCurrent} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'A' }));
    expect(onSaveCurrent).not.toHaveBeenCalled();
  });
});

describe('WorkspaceSwitcher — edit', () => {
  it('renames the current workspace', async () => {
    const user = userEvent.setup();
    const a = await createWorkspace('Old Name');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Edit workspace' }));
    const nameField = await screen.findByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'New Name');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(probeList().find((w) => w.id === a.id)?.name).toBe('New Name'));
  });
});

describe('WorkspaceSwitcher — delete', () => {
  it('disables "Delete current" when there is only one workspace', async () => {
    const user = userEvent.setup();
    const a = await createWorkspace('Only');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: 'Delete current' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('deletes the current workspace and switches to another', async () => {
    const user = userEvent.setup();
    const a = await createWorkspace('A');
    const b = await createWorkspace('B');
    render(<Harness initialList={[a, b]} initialCurrentId={b.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete current' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(probeList().some((w) => w.id === b.id)).toBe(false));
  });

  it('warns about cascading sub-workspace deletion', async () => {
    const user = userEvent.setup();
    const { createSubWorkspace } = await import('../utils/workspaceStorage');
    const a = await createWorkspace('Parent');
    await createSubWorkspace('Child', a.id);
    const list = await getWorkspaceList();
    render(<Harness initialList={list.workspaces} initialCurrentId={a.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete current' }));
    expect(await screen.findByText(/and its 1 sub-workspace/)).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });
});

describe('WorkspaceSwitcher — duplicate', () => {
  it('duplicates the root workspace under a new name', async () => {
    const user = userEvent.setup();
    const a = await createWorkspace('Original');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate workspace' }));
    expect(await screen.findByDisplayValue('Original (copy)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(probeList().some((w) => w.name === 'Original (copy)')).toBe(true));
  });

  it('duplicates a sub-workspace into a brand-new parent workspace', async () => {
    const user = userEvent.setup();
    const { createSubWorkspace } = await import('../utils/workspaceStorage');
    const parent = await createWorkspace('Parent');
    const child = await createSubWorkspace('Child', parent.id);
    const list = await getWorkspaceList();
    render(<Harness initialList={list.workspaces} initialCurrentId={child.id} />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate sub-workspace' }));
    await user.click(await screen.findByRole('radio', { name: 'New workspace' }));
    await user.type(screen.getByLabelText('New workspace name'), 'Brand New Parent');
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(probeList().some((w) => w.name === 'Brand New Parent')).toBe(true));
    const newParent = probeList().find((w) => w.name === 'Brand New Parent')!;
    const duplicatedChild = probeList().find((w) => w.parentId === newParent.id);
    expect(duplicatedChild).toBeTruthy();
  });
});

describe('WorkspaceSwitcher — save/open (non-FSA fallback)', () => {
  it('"Save Workspace" shows the download-fallback hint when FSA is unavailable', async () => {
    const user = userEvent.setup();
    const a = await createWorkspace('A');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);
    await openMenu(user);
    expect(screen.getByText('Downloads as .idcard file')).toBeInTheDocument();
  });

  it('clicking "Save Workspace" calls the FSA-fallback save path', async () => {
    const user = userEvent.setup();
    const { saveWorkspaceWithPicker } = await import('../utils/workspaceFile');
    const a = await createWorkspace('A');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Save Workspace/ }));
    await waitFor(() => expect(saveWorkspaceWithPicker).toHaveBeenCalled());
  });

  it('opening an invalid file shows an error dialog', async () => {
    const { readWorkspaceFile } = await import('../utils/workspaceFile');
    vi.mocked(readWorkspaceFile).mockResolvedValue(null);
    const a = await createWorkspace('A');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);

    const input = document.querySelector('input[type="file"][accept*="idcard"]') as HTMLInputElement;
    const file = new File(['not valid'], 'bad.idcard');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await screen.findByText('Could Not Open Workspace')).toBeInTheDocument();
    expect(screen.getByText('Invalid workspace file. Please select a valid .idcard file.')).toBeInTheDocument();
  });

  it('opening a valid file creates a new root workspace and switches to it', async () => {
    const { readWorkspaceFile } = await import('../utils/workspaceFile');
    const wsFile = {
      version: 1 as const, app: 'id_card_generator' as const, type: 'workspace' as const, savedAt: 'x',
      name: 'Imported Workspace',
      data: {
        template: { id: 't', name: 'T', elements: [], background: null, watermark: null },
        records: [], columnMapping: {}, printPresets: [],
        printSettings: { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' as const },
        selectedCardIndices: [], currentTemplateSource: null,
      },
    };
    vi.mocked(readWorkspaceFile).mockResolvedValue(wsFile);
    const a = await createWorkspace('A');
    render(<Harness initialList={[a]} initialCurrentId={a.id} />);

    const input = document.querySelector('input[type="file"][accept*="idcard"]') as HTMLInputElement;
    const file = new File(['{}'], 'import.idcard');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(probeList().some((w) => w.name === 'Imported Workspace')).toBe(true));
    const imported = probeList().find((w) => w.name === 'Imported Workspace')!;
    expect(probe()).toHaveAttribute('data-current-id', imported.id);
  });
});

describe('WorkspaceSwitcher — first-launch setup', () => {
  it('shows the welcome dialog and creates a workspace from it', async () => {
    const user = userEvent.setup();
    const onSetupDone = vi.fn();
    render(<Harness initialList={[]} initialCurrentId="" needsSetup onSetupDone={onSetupDone} />);

    expect(await screen.findByText('Welcome to ID Card Generator')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create New Workspace' }));
    await user.type(await screen.findByLabelText('Name'), 'My First Workspace');
    await user.click(screen.getByRole('button', { name: 'Save to File & Create' }));

    await waitFor(() => expect(onSetupDone).toHaveBeenCalled());
    expect(probeList().some((w) => w.name === 'My First Workspace')).toBe(true);
  });

  it('"Back" from naming returns to the choose step', async () => {
    const user = userEvent.setup();
    render(<Harness initialList={[]} initialCurrentId="" needsSetup />);
    await user.click(await screen.findByRole('button', { name: 'Create New Workspace' }));
    await screen.findByLabelText('Name');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Welcome to ID Card Generator')).toBeInTheDocument();
  });
});
