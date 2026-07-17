import React, { useState, useId, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import ContentCopy from '@mui/icons-material/ContentCopy';
import Image from '@mui/icons-material/Image';
import SaveAlt from '@mui/icons-material/SaveAlt';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import SubdirectoryArrowRight from '@mui/icons-material/SubdirectoryArrowRight';
import CreateNewFolder from '@mui/icons-material/CreateNewFolder';
import type { WorkspaceMeta, WorkspaceData } from '../utils/workspaceStorage';
import {
  getWorkspaceList,
  getWorkspaceData,
  getEffectiveWorkspaceData,
  createWorkspace,
  createWorkspaceId,
  saveWorkspaceList,
  createSubWorkspace,
  deleteWorkspaceTree,
  deleteWorkspaceData,
  renameWorkspace,
  updateWorkspaceMeta,
  getDefaultWorkspaceData,
  saveWorkspaceData,
  duplicateWorkspace,
} from '../utils/workspaceStorage';
import {
  saveWorkspaceWithPicker,
  pickSaveFileHandle,
  writeWorkspaceToHandle,
  downloadWorkspaceFile,
  openWorkspaceFilePickerWithHandle,
  readWorkspaceFile,
  hasOpenFilePicker,
  hasSaveFilePicker,
  deleteWorkspaceFile,
  requestRemovePermission,
  type WorkspaceFileHandle,
} from '../utils/workspaceFile';
import { setStoredHandle, deleteStoredHandle, getAllStoredHandles } from '../utils/fileHandleStore';
import { resolveWorkspaceAssets } from '../utils/assetStore';
import { readFileAsDataUrl } from '../utils/file';
import { loadUserTemplates, saveUserTemplate } from '../utils/userTemplates';

interface WorkspaceSwitcherProps {
  workspaceList: WorkspaceMeta[];
  currentWorkspaceId: string;
  currentWorkspaceLogo?: string;
  autoSaveToFile: boolean;
  onAutoSaveToFileChange: (v: boolean) => void;
  fileHandleRef: React.MutableRefObject<Map<string, WorkspaceFileHandle>>;
  /** Bumped by App.tsx after async-rehydrating fileHandleRef from IndexedDB, so the handle-sync effect re-runs. */
  handleRehydrationTick: number;
  onSaveCurrent: (overrides?: Partial<WorkspaceData>) => Promise<void>;
  onLoadWorkspace: (data: WorkspaceData) => void;
  onSetCurrentWorkspace: (id: string) => void;
  onSetWorkspaceList: (list: WorkspaceMeta[]) => void;
  onSetWorkspaceLogo: (logo: string | undefined) => void;
  needsSetup?: boolean;
  onSetupDone?: () => void;
}

export default function WorkspaceSwitcher({
  workspaceList,
  currentWorkspaceId,
  currentWorkspaceLogo,
  autoSaveToFile,
  onAutoSaveToFileChange,
  fileHandleRef,
  handleRehydrationTick,
  onSaveCurrent,
  onLoadWorkspace,
  onSetCurrentWorkspace,
  onSetWorkspaceList,
  onSetWorkspaceLogo,
  needsSetup,
  onSetupDone,
}: WorkspaceSwitcherProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [hasFileHandle, setHasFileHandle] = useState(false);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  // 'unknown' until queryPermission resolves; 'needs-reconnect' means the browser dropped
  // write access (typically after a reload) and a user-gesture requestPermission() is required.
  const [permissionState, setPermissionState] = useState<'granted' | 'needs-reconnect' | 'unknown'>('unknown');
  const [reconnectError, setReconnectError] = useState<'not-found' | 'denied' | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<'choose' | 'naming'>('choose');

  // new workspace
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState<string | null>(null);
  // new sub-workspace
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubLogo, setNewSubLogo] = useState<string | null>(null);
  // Sub-workspaces always inherit the parent's template and print settings
  const [newSubParentId, setNewSubParentId] = useState<string | null>(null);
  const [newSubError, setNewSubError] = useState<string | null>(null);
  const newSubNameInputRef = useRef<HTMLInputElement>(null);

  // The Dialog's autoFocus races with the closing workspace Menu's own focus
  // trap teardown, so focus lands on the Dialog container instead of the field.
  useEffect(() => {
    if (!newSubOpen) return;
    const id = requestAnimationFrame(() => newSubNameInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [newSubOpen]);
  // edit / delete
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFileFromDisk, setDeleteFileFromDisk] = useState(true);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);
  // duplicate root workspace
  const [dupRootOpen, setDupRootOpen] = useState(false);
  const [dupRootName, setDupRootName] = useState('');
  // duplicate sub-workspace
  const [dupSubOpen, setDupSubOpen] = useState(false);
  const [dupSubName, setDupSubName] = useState('');
  const [dupSubLocation, setDupSubLocation] = useState<'same' | 'different' | 'new'>('same');
  const [dupSubTargetParentId, setDupSubTargetParentId] = useState('');
  const [dupSubNewParentName, setDupSubNewParentName] = useState('');
  // misc
  const [openError, setOpenError] = useState<string | null>(null);
  const [templateSyncError, setTemplateSyncError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openFileInputId = useId();

  // ---- Derived tree data ----
  const currentMeta = workspaceList.find((w) => w.id === currentWorkspaceId);
  const parentMeta = currentMeta?.parentId
    ? workspaceList.find((w) => w.id === currentMeta.parentId)
    : null;

  // Root id for the currently active workspace (sub-workspaces share their parent's root).
  const currentRootId = currentMeta?.parentId ?? currentWorkspaceId;
  // Mirrors currentRootId into a ref so a stale async permission check (e.g. from
  // setHandleForRoot) can detect the user has since switched to a different workspace
  // and skip clobbering that workspace's permissionState.
  const currentRootIdRef = useRef(currentRootId);
  currentRootIdRef.current = currentRootId;

  // Resolves permissionState for a given handle: freshly-acquired handles (same session) have
  // no queryPermission gap and are treated as 'granted'; rehydrated ones need an explicit
  // permission check since the browser may require a fresh user gesture to re-grant write
  // access. `isCancelled` lets callers (like the effect below) opt out of a stale async update.
  const applyPermissionState = (handle: WorkspaceFileHandle | undefined, isCancelled?: () => boolean) => {
    if (!handle) { setPermissionState('unknown'); return; }
    if (typeof handle.queryPermission !== 'function') { setPermissionState('granted'); return; }
    void handle.queryPermission({ mode: 'readwrite' }).then((state) => {
      if (!isCancelled?.()) setPermissionState(state === 'granted' ? 'granted' : 'needs-reconnect');
    }).catch(() => { if (!isCancelled?.()) setPermissionState('needs-reconnect'); });
  };

  // Sync hasFileHandle / savedFileName / permissionState from the map whenever the active
  // workspace changes, or whenever App.tsx finishes rehydrating handles from IndexedDB
  // (handleRehydrationTick).
  useEffect(() => {
    const handle = fileHandleRef.current.get(currentRootId);
    setHasFileHandle(!!handle);
    setSavedFileName(handle?.name ?? null);
    setReconnectError(null);
    setBannerDismissed(false);
    let cancelled = false;
    applyPermissionState(handle, () => cancelled);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId, handleRehydrationTick]);

  const handleReconnect = async () => {
    const handle = fileHandleRef.current.get(currentRootId);
    if (!handle || typeof handle.requestPermission !== 'function') return;
    try {
      const state = await handle.requestPermission({ mode: 'readwrite' });
      if (state === 'granted') {
        setPermissionState('granted');
        setReconnectError(null);
        // requestPermission alone doesn't guarantee the file is still reachable on disk.
        const fsaHandle = handle as WorkspaceFileHandle & { getFile?: () => Promise<File> };
        if (typeof fsaHandle.getFile === 'function') {
          await fsaHandle.getFile();
        }
      } else {
        setReconnectError('denied');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        setReconnectError('not-found');
      } else {
        setReconnectError('denied');
      }
    }
  };

  // requestPermission() can only be called as a result of a real user gesture — the File
  // System Access API has no fully-silent way to re-arm write access after a reload, by
  // design. The closest thing to "automatic": attempt reconnect on the user's first
  // click/keypress anywhere in the app rather than making them find a "Reconnect" button.
  // If the browser already remembers a standing grant, this resolves with no visible
  // prompt at all. Fires at most once per reconnect episode (per workspace switch / rehydration).
  const permissionStateRef = useRef(permissionState);
  permissionStateRef.current = permissionState;
  const handleReconnectRef = useRef(handleReconnect);
  handleReconnectRef.current = handleReconnect;

  useEffect(() => {
    let attempted = false;
    const tryReconnect = () => {
      if (attempted || permissionStateRef.current !== 'needs-reconnect') return;
      attempted = true;
      document.removeEventListener('click', tryReconnect, true);
      document.removeEventListener('keydown', tryReconnect, true);
      void handleReconnectRef.current();
    };
    document.addEventListener('click', tryReconnect, true);
    document.addEventListener('keydown', tryReconnect, true);
    return () => {
      document.removeEventListener('click', tryReconnect, true);
      document.removeEventListener('keydown', tryReconnect, true);
    };
  }, [currentWorkspaceId, handleRehydrationTick]);

  const setHandleForRoot = (rootId: string, handle: WorkspaceFileHandle) => {
    fileHandleRef.current.set(rootId, handle);
    if (rootId === currentRootId) {
      setHasFileHandle(true);
      setSavedFileName(handle.name);
      applyPermissionState(handle, () => currentRootIdRef.current !== rootId);
    }
    void setStoredHandle(rootId, handle);
  };

  const clearHandleForRoot = (rootId: string) => {
    fileHandleRef.current.delete(rootId);
    if (rootId === currentRootId) {
      setHasFileHandle(false);
      setSavedFileName(null);
    }
    void deleteStoredHandle(rootId);
  };

  // Button label: "Parent › Child" when inside a sub-workspace
  const buttonLabel = parentMeta
    ? `${parentMeta.name} › ${currentMeta?.name ?? 'Workspace'}`
    : (currentMeta?.name ?? 'Workspace');
  const currentLogo = currentWorkspaceLogo ?? currentMeta?.logo ?? parentMeta?.logo;

  // Root workspaces (no parentId, or parentId points to a missing workspace — treated as root)
  const rootWorkspaces = workspaceList.filter(
    (w) => !w.parentId || !workspaceList.some((p) => p.id === w.parentId),
  );
  // Children grouped by parentId
  const childrenByParent: Record<string, WorkspaceMeta[]> = {};
  workspaceList
    .filter((w) => w.parentId && workspaceList.some((p) => p.id === w.parentId))
    .forEach((w) => {
      const pid = w.parentId!;
      childrenByParent[pid] = [...(childrenByParent[pid] ?? []), w];
    });

  // Children of the currently active workspace (for cascading delete warning)
  const currentChildren = workspaceList.filter((w) => w.parentId === currentWorkspaceId);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl((prev) => (prev ? null : e.currentTarget));
  };
  const handleClose = () => setAnchorEl(null);

  // ---- Switch ----
  const doSwitch = async (id: string) => {
    await onSaveCurrent();
    const list = await getWorkspaceList();
    list.currentId = id;
    await saveWorkspaceList(list);
    const data = await getEffectiveWorkspaceData(id);
    // Resolve asset refs BEFORE any dispatch: all three dispatches must land in one
    // render batch so onLoadWorkspace's autosave skip-flag covers the id change too.
    const toLoad = data ? await resolveWorkspaceAssets(data) : getDefaultWorkspaceData();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(id);
    onLoadWorkspace({ ...toLoad, logo: toLoad.logo });
    handleClose();
  };

  const handleSwitch = (id: string) => {
    if (id === currentWorkspaceId) { handleClose(); return; }
    const targetRootId = workspaceList.find((w) => w.id === id)?.parentId ?? id;
    const leavingCurrentTree = targetRootId !== currentRootId;
    // On FSA browsers, block switching away from an unsaved (unlinked) workspace.
    if (leavingCurrentTree && hasSaveFilePicker() && !hasFileHandle) {
      setPendingSwitchId(id);
      handleClose();
      return;
    }
    void doSwitch(id);
  };

  const handleUnsavedSaveAndSwitch = async () => {
    if (!pendingSwitchId) return;
    const targetId = pendingSwitchId;
    setPendingSwitchId(null);
    const saved = await handleSaveWorkspace();
    if (saved) await doSwitch(targetId);
  };

  const handleUnsavedSwitchAnyway = () => {
    if (!pendingSwitchId) return;
    const targetId = pendingSwitchId;
    setPendingSwitchId(null);
    void doSwitch(targetId);
  };

  // ---- New workspace ----
  const handleNewWorkspaceClick = () => {
    setNewName(''); setNewLogo(null); setNewOpen(true); handleClose();
  };

  const handleNewWorkspaceConfirm = async () => {
    const name = newName.trim();
    if (!name) return;
    const logo = newLogo ?? undefined;
    setNewOpen(false); // close the normal dialog before the OS file picker opens

    await onSaveCurrent();

    const defaultData = { ...getDefaultWorkspaceData(), logo };
    const handle = await saveWorkspaceWithPicker(name, defaultData);
    // Clear form fields after the picker resolves regardless of outcome.
    setNewName(''); setNewLogo(null);
    // On FSA browsers a null handle means the user cancelled — abort workspace creation.
    // On non-FSA browsers saveWorkspaceWithPicker triggers a download and returns null, so proceed.
    if (handle === null && hasSaveFilePicker()) return;

    const meta = await createWorkspace(name, logo);
    const list = await getWorkspaceList();
    await saveWorkspaceData(meta.id, { ...defaultData, csvData: null });
    // Register the handle BEFORE switching to the new workspace: onSetCurrentWorkspace
    // triggers the handle-sync effect (keyed on currentWorkspaceId), which reads
    // fileHandleRef synchronously on the next render — if the handle isn't in the ref
    // yet, that effect sees "no handle" and never re-runs, permanently showing the
    // freshly-saved workspace as unlinked (hasFileHandle stuck false).
    if (handle) {
      setHandleForRoot(meta.id, handle);
    }
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    onLoadWorkspace(defaultData);
    setSetupStep('choose');
    onSetupDone?.();
  };

  // ---- New sub-workspace ----
  const handleNewSubWorkspace = (parentId: string) => {
    setNewSubParentId(parentId);
    setNewSubName('');
    setNewSubLogo(null);
    setNewSubError(null);
    setNewSubOpen(true);
    handleClose();
  };

  const handleNewSubWorkspaceConfirm = async () => {
    const name = newSubName.trim();
    if (!name || !newSubParentId) return;
    const logo = newSubLogo ?? undefined;
    await onSaveCurrent();
    let initialData = getDefaultWorkspaceData();
    const parentData = await getWorkspaceData(newSubParentId);
    if (parentData) {
      // Stored parent data may hold asset: refs — resolve so in-memory state gets real data URLs.
      const resolved = await resolveWorkspaceAssets(parentData);
      initialData = {
        ...initialData,
        template: resolved.template,
        currentTemplateSource: resolved.currentTemplateSource,
        printSettings: resolved.printSettings,
        printPresets: resolved.printPresets,
        // Copy-on-write: track the parent's template (own template is a fallback
        // snapshot) until this sub-workspace makes its first design edit.
        templateLinkedToParent: true,
      };
    }
    // Persist the data BEFORE registering the workspace in the list, so a failed
    // write aborts creation instead of leaving a workspace that silently lost
    // its inherited template.
    const newId = createWorkspaceId();
    if (!(await saveWorkspaceData(newId, { ...initialData, logo }))) {
      setNewSubError('Could not create the sub-workspace: browser storage is full. Delete unused workspaces or remove large images, then try again.');
      return;
    }
    const meta = await createSubWorkspace(name, newSubParentId, logo, newId);
    const list = await getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    onLoadWorkspace({ ...initialData, logo });
    setNewSubOpen(false);
    setNewSubName('');
    setNewSubLogo(null);
    setNewSubParentId(null);
    setNewSubError(null);
  };

  // ---- Edit ----
  const handleEditOpen = () => {
    setEditName(currentMeta?.name ?? '');
    // Use only this workspace's own logo — don't inherit the parent's logo as a default,
    // which would accidentally copy it onto the child on save.
    setEditLogo(currentWorkspaceLogo ?? currentMeta?.logo ?? null);
    setEditOpen(true);
    handleClose();
  };

  const handleEditConfirm = async () => {
    if (!currentWorkspaceId) return;
    const name = editName.trim() || (currentMeta?.name ?? 'Workspace');
    const logo = editLogo ?? undefined;
    await renameWorkspace(currentWorkspaceId, name);
    await updateWorkspaceMeta(currentWorkspaceId, { logo });
    onSetWorkspaceLogo(logo);
    await onSaveCurrent({ logo });
    const list = await getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    setEditOpen(false); setEditName(''); setEditLogo(null);
  };

  // ---- Delete ----
  // Only a root workspace's file can be offered for on-disk deletion — a sub-workspace
  // shares its root's .idcard file with the root and any siblings, so deleting a
  // sub-workspace must never touch that file.
  const isRootDelete = !currentMeta?.parentId;
  const deletingLinkedFile = isRootDelete && hasFileHandle;

  const handleDeleteOpen = () => {
    setDeleteFileFromDisk(true);
    setDeleteFileError(null);
    setDeleteOpen(true);
    handleClose();
  };

  const handleDeleteConfirm = async () => {
    if (!currentWorkspaceId) return;
    const handleToDelete = deletingLinkedFile && deleteFileFromDisk
      ? fileHandleRef.current.get(currentRootId)
      : undefined;
    // Request removal permission immediately, before any slow IndexedDB work below —
    // requestPermission() requires transient user activation from this click, the same
    // constraint handleSaveWorkspace works around by acquiring its handle up front.
    const canRemoveFile = handleToDelete ? await requestRemovePermission(handleToDelete) : false;
    clearHandleForRoot(currentRootId);
    await onSaveCurrent();
    await deleteWorkspaceTree(currentWorkspaceId);
    if (handleToDelete) {
      const ok = canRemoveFile && await deleteWorkspaceFile(handleToDelete);
      if (!ok) {
        setDeleteFileError(
          `Removed "${currentMeta?.name}" from your workspace list, but couldn't delete ${handleToDelete.name} from disk. You may need to delete it manually.`,
        );
      }
    }
    const list = await getWorkspaceList();
    const data = await getEffectiveWorkspaceData(list.currentId);
    const toLoad = data ? await resolveWorkspaceAssets(data) : getDefaultWorkspaceData();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(list.currentId);
    onLoadWorkspace({ ...toLoad, logo: toLoad.logo });
    setDeleteOpen(false);
  };

  // ---- Save Workspace ----
  // Returns true when the file was written (existing handle or new handle acquired).
  // Returns false when the FSA picker was cancelled without acquiring a handle.
  const handleSaveWorkspace = async (): Promise<boolean> => {
    handleClose();
    setSaving(true);
    try {
      const rootId = currentMeta?.parentId ?? currentWorkspaceId;
      const rootMeta = workspaceList.find((w) => w.id === rootId);
      const rootName = rootMeta?.name ?? 'Workspace';
      const existingHandle = fileHandleRef.current.get(rootId);

      // Acquire the file handle FIRST, before any slow data gathering below.
      // showSaveFilePicker() requires transient user activation, which a
      // workspace tree with several sub-workspaces can outlast if the picker
      // is only requested after awaiting all of their IndexedDB reads/asset
      // resolution — the picker would then silently fail to open.
      let handle: WorkspaceFileHandle | null = existingHandle ?? null;
      let cancelled = false;
      if (!handle && hasSaveFilePicker()) {
        handle = await pickSaveFileHandle(rootName);
        if (!handle) cancelled = true;
      }

      // Flush current before reading child data — always, even if the picker
      // above was cancelled, matching the original pre-refactor behavior. The
      // picker has already resolved by this point either way, so this doesn't
      // reopen the transient-activation window the reordering above exists to
      // avoid; it only restores the flush that a cancelled save shouldn't skip.
      await onSaveCurrent();
      if (cancelled) return false;

      // Always save from the root perspective so children are included.
      // Resolve asset: refs so the .idcard file is self-contained.
      const rootData = await resolveWorkspaceAssets((await getWorkspaceData(rootId)) ?? getDefaultWorkspaceData());

      const childMetas = workspaceList.filter((w) => w.parentId === rootId);
      const children = await Promise.all(childMetas.map(async (meta) => ({
        meta: { name: meta.name, ...(meta.logo ? { logo: meta.logo } : {}) },
        data: await resolveWorkspaceAssets((await getWorkspaceData(meta.id)) ?? getDefaultWorkspaceData()),
      })));

      if (handle) {
        const ok = await writeWorkspaceToHandle(handle, rootName, rootData, children);
        if (ok && !existingHandle) setHandleForRoot(rootId, handle);
        return ok;
      }
      // Non-FSA browsers: no picker was ever acquired above — fall back to a direct download.
      downloadWorkspaceFile(rootName, rootData, children);
      return true;
    } finally {
      setSaving(false);
    }
  };

  // ---- Open Workspace ----
  // Compares a newly-opened handle against every handle already known — both in the live
  // session Map and in IndexedDB (in case the async rehydration in App.tsx hasn't finished
  // populating the Map yet) — via the spec-correct FileSystemHandle.isSameEntry, since
  // handles can't be compared by reference or path. Returns the existing root workspace id
  // on a match, or null.
  const findExistingRootByHandle = async (
    newHandle: WorkspaceFileHandle,
  ): Promise<string | null> => {
    if (typeof newHandle.isSameEntry !== 'function') return null;
    const candidates = new Map(fileHandleRef.current);
    const stored = await getAllStoredHandles();
    for (const [rootId, handle] of stored.entries()) {
      if (!candidates.has(rootId)) candidates.set(rootId, handle);
    }
    for (const [rootId, existing] of candidates.entries()) {
      try {
        if (await newHandle.isSameEntry(existing)) return rootId;
      } catch {
        // ignore comparison failures (e.g. handle from a different origin/context)
      }
    }
    return null;
  };

  const restoreWorkspaceFile = async (
    wsFile: import('../utils/workspaceFile').WorkspaceFile,
    handle?: WorkspaceFileHandle,
  ) => {
    await onSaveCurrent(); // flush any unsaved in-memory edits before switching away

    // Sync user templates embedded in the imported file into the local user-templates store
    // so they appear in the "My templates" section of the Start From Template modal.
    // This handles the case where the file was created on a different machine (or after
    // localStorage was cleared) where the originating user templates don't exist locally.
    const existingIds = new Set((await loadUserTemplates()).map((t) => t.meta.id));
    const syncTemplate = async (data: WorkspaceData) => {
      if (data.currentTemplateSource?.type === 'user' && data.template) {
        const id = data.currentTemplateSource.id;
        if (!existingIds.has(id)) {
          if (!(await saveUserTemplate(data.template))) {
            setTemplateSyncError(
              'Browser storage is full — templates from the opened file could not be added to "My templates". The workspace itself opened fine.',
            );
          }
          existingIds.add(id);
        }
      }
    };
    await syncTemplate(wsFile.data);
    for (const child of wsFile.children ?? []) {
      await syncTemplate(child.data);
    }

    // Create a fresh root workspace entry so the opened file never clobbers an existing workspace.
    const rootId = createWorkspaceId();
    const rootEntry: WorkspaceMeta = { id: rootId, name: wsFile.name };
    const list = await getWorkspaceList();
    const newWorkspaces: WorkspaceMeta[] = [...list.workspaces, rootEntry];

    await saveWorkspaceData(rootId, wsFile.data);

    if (wsFile.children && wsFile.children.length > 0) {
      for (const child of wsFile.children) {
        const childId = createWorkspaceId();
        const childEntry: WorkspaceMeta = {
          id: childId,
          name: child.meta.name,
          parentId: rootId,
          ...(child.meta.logo ? { logo: child.meta.logo } : {}),
        };
        newWorkspaces.push(childEntry);
        await saveWorkspaceData(childId, child.data);
      }
    }

    list.workspaces = newWorkspaces;
    list.currentId = rootId;
    await saveWorkspaceList(list);

    // Register the handle BEFORE switching to the new workspace — see the matching
    // comment in handleNewWorkspaceConfirm for why the ordering matters.
    if (handle) {
      setHandleForRoot(rootId, handle);
    }
    onSetWorkspaceList(newWorkspaces);
    onSetCurrentWorkspace(rootId);
    onLoadWorkspace(wsFile.data);
    onSetupDone?.();
    return rootId;
  };

  const handleOpenWorkspace = async () => {
    handleClose();
    if (hasOpenFilePicker()) {
      const result = await openWorkspaceFilePickerWithHandle();
      if (!result) return; // cancelled
      const existingRootId = await findExistingRootByHandle(result.handle);
      if (existingRootId && workspaceList.some((w) => w.id === existingRootId)) {
        // Same file already open as a workspace — switch to it instead of duplicating.
        setHandleForRoot(existingRootId, result.handle);
        await doSwitch(existingRootId);
        onSetupDone?.();
        return;
      }
      const wsFile = await readWorkspaceFile(result.file);
      if (wsFile) {
        await restoreWorkspaceFile(wsFile, result.handle);
      } else {
        setOpenError('Invalid workspace file. Please select a valid .idcard file.');
      }
    } else {
      document.getElementById(openFileInputId)?.click();
    }
  };

  const handleOpenFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const wsFile = await readWorkspaceFile(file);
    if (!wsFile) {
      setOpenError('Invalid workspace file. Please select a valid .idcard file.');
      return;
    }
    await restoreWorkspaceFile(wsFile);
  };

  // ---- Duplicate root workspace ----
  const handleDupRootOpen = () => {
    setDupRootName(`${currentMeta?.name ?? 'Workspace'} (copy)`);
    setDupRootOpen(true);
    handleClose();
  };

  const handleDupRootConfirm = async () => {
    const name = dupRootName.trim();
    if (!name) return;
    await onSaveCurrent();
    const meta = await duplicateWorkspace(currentWorkspaceId, name);
    const list = await getWorkspaceList();
    const data = await getWorkspaceData(meta.id);
    const toLoad = data ? await resolveWorkspaceAssets(data) : getDefaultWorkspaceData();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    onLoadWorkspace({ ...toLoad, logo: data?.logo });
    setDupRootOpen(false);
    setDupRootName('');
  };

  // ---- Duplicate sub-workspace ----
  const otherRootWorkspaces = rootWorkspaces.filter((w) => w.id !== currentMeta?.parentId);

  const handleDupSubOpen = () => {
    setDupSubName(`${currentMeta?.name ?? 'Sub-workspace'} (copy)`);
    setDupSubLocation('same');
    setDupSubTargetParentId(otherRootWorkspaces[0]?.id ?? '');
    setDupSubNewParentName('');
    setDupSubOpen(true);
    handleClose();
  };

  const handleDupSubConfirm = async () => {
    const name = dupSubName.trim();
    if (!name || !currentMeta?.parentId) return;

    await onSaveCurrent();

    let targetParentId = currentMeta.parentId;
    let createdNewParentId: string | null = null;

    try {
    if (dupSubLocation === 'different') {
      if (!dupSubTargetParentId) return;
      targetParentId = dupSubTargetParentId;
    } else if (dupSubLocation === 'new') {
      const newParentName = dupSubNewParentName.trim();
      if (!newParentName) return;
      // Create the new root workspace without switching currentId yet —
      // duplicateWorkspace will set currentId to the final duplicate in one go.
      const newParentId = createWorkspaceId();
      const newParentMeta: WorkspaceMeta = { id: newParentId, name: newParentName };
      const list = await getWorkspaceList();
      list.workspaces = [...list.workspaces, newParentMeta];
      await saveWorkspaceList(list);
      await saveWorkspaceData(newParentId, getDefaultWorkspaceData());
      createdNewParentId = newParentId;
      targetParentId = newParentId;
    }

    const meta = await duplicateWorkspace(currentWorkspaceId, name, targetParentId);
    const list = await getWorkspaceList();
    const data = await getWorkspaceData(meta.id);
    const toLoad = data ? await resolveWorkspaceAssets(data) : getDefaultWorkspaceData();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    onLoadWorkspace({ ...toLoad, logo: data?.logo });

    setDupSubOpen(false);
    setDupSubName('');
    setDupSubLocation('same');
    setDupSubTargetParentId('');
    setDupSubNewParentName('');
    } catch (err) {
      // Roll back the new parent workspace if it was written but the duplicate failed.
      if (createdNewParentId) {
        const list = await getWorkspaceList();
        list.workspaces = list.workspaces.filter((w) => w.id !== createdNewParentId);
        await saveWorkspaceList(list);
        await deleteWorkspaceData(createdNewParentId);
      }
      console.error('Duplicate sub-workspace failed:', err);
      alert(`Could not duplicate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ---- Logo input handler (reused for new / sub / edit) ----
  const makeLogoHandler =
    (setter: (v: string | null) => void) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
      if (file.size > 1 * 1024 * 1024) { alert('Logo must be under 1 MB.'); return; }
      setter(await readFileAsDataUrl(file));
    };

  return (
    <ClickAwayListener onClickAway={() => anchorEl != null && handleClose()}>
      <Box>
        {/* ---- Trigger button ---- */}
        <Button
          variant="outlined"
          size="small"
          startIcon={
            currentLogo ? (
              <Avatar src={currentLogo} sx={{ width: 20, height: 20 }} variant="rounded" />
            ) : (
              <FolderOpen />
            )
          }
          onClick={handleOpen}
          aria-label="Switch workspace"
          aria-expanded={Boolean(anchorEl)}
          aria-haspopup="true"
          sx={{ textTransform: 'none' }}
          disabled={saving}
        >
          {buttonLabel}
        </Button>

        {/* ---- Workspace menu ---- */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          disableRestoreFocus
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {/* Workspace tree — flatMap to avoid Fragment as direct Menu child (MUI limitation) */}
          {rootWorkspaces.flatMap((w) => [
            /* Parent (root) row */
            <MenuItem key={`root-${w.id}`} selected={w.id === currentWorkspaceId} onClick={() => handleSwitch(w.id)}>
              {w.logo ? (
                <Avatar src={w.logo} sx={{ width: 24, height: 24, mr: 1.5 }} variant="rounded" />
              ) : (
                <ListItemIcon sx={{ minWidth: 40 }}><FolderOpen fontSize="small" /></ListItemIcon>
              )}
              <ListItemText primary={w.name} />
            </MenuItem>,

            /* Children (indented) */
            ...(childrenByParent[w.id] ?? []).map((child) => (
              <MenuItem
                key={child.id}
                selected={child.id === currentWorkspaceId}
                onClick={() => handleSwitch(child.id)}
                sx={{ pl: 4 }}
              >
                {child.logo ? (
                  <Avatar src={child.logo} sx={{ width: 20, height: 20, mr: 1.5 }} variant="rounded" />
                ) : (
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <SubdirectoryArrowRight fontSize="small" sx={{ color: 'text.secondary' }} />
                  </ListItemIcon>
                )}
                <ListItemText primary={child.name} />
              </MenuItem>
            )),

            /* Add sub-workspace row */
            <MenuItem
              key={`add-sub-${w.id}`}
              onClick={() => handleNewSubWorkspace(w.id)}
              sx={{ pl: 4, py: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>
                <Add fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Add sub-workspace"
                primaryTypographyProps={{ variant: 'body2', color: 'primary' }}
              />
            </MenuItem>,
          ])}

          <Divider />

          <MenuItem onClick={handleNewWorkspaceClick}>
            <ListItemIcon><Add fontSize="small" /></ListItemIcon>
            <ListItemText primary="New workspace" />
          </MenuItem>
          <MenuItem onClick={handleEditOpen}>
            <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
            <ListItemText primary="Edit workspace" />
          </MenuItem>
          {currentMeta?.parentId ? (
            <MenuItem onClick={handleDupSubOpen}>
              <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
              <ListItemText primary="Duplicate sub-workspace" />
            </MenuItem>
          ) : (
            <MenuItem onClick={handleDupRootOpen}>
              <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
              <ListItemText primary="Duplicate workspace" />
            </MenuItem>
          )}
          <MenuItem
            onClick={handleDeleteOpen}
            disabled={workspaceList.length <= 1}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}><Delete fontSize="small" /></ListItemIcon>
            <ListItemText primary="Delete current" />
          </MenuItem>

          <Divider />

          <MenuItem onClick={handleSaveWorkspace}>
            <ListItemIcon><SaveAlt fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="Save Workspace"
              secondary={
                !hasSaveFilePicker()
                  ? 'Downloads as .idcard file'
                  : hasFileHandle
                  ? (savedFileName ? `Saving to ${savedFileName}` : 'Overwrite saved file')
                  : 'Choose save location'
              }
            />
          </MenuItem>

          <MenuItem onClick={handleOpenWorkspace}>
            <ListItemIcon><FolderOpenOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="Open Workspace" secondary="Load a saved .idcard file" />
          </MenuItem>

          {hasSaveFilePicker() && (
            <MenuItem
              onClick={() => {
                if (hasFileHandle && permissionState === 'needs-reconnect') { void handleReconnect(); return; }
                onAutoSaveToFileChange(!autoSaveToFile);
              }}
              dense
              disabled={!hasFileHandle}
              sx={{ pl: 1 }}
            >
              {hasFileHandle && permissionState === 'needs-reconnect' ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={(e) => { e.stopPropagation(); void handleReconnect(); }}
                  sx={{ minWidth: 0, mr: 1 }}
                >
                  Reconnect
                </Button>
              ) : (
                <Switch
                  size="small"
                  checked={autoSaveToFile && hasFileHandle && permissionState === 'granted'}
                  disabled={!hasFileHandle || permissionState !== 'granted'}
                  onChange={(e) => { e.stopPropagation(); onAutoSaveToFileChange(e.target.checked); }}
                  sx={{ mr: 1 }}
                />
              )}
              <ListItemText
                primary="Autosave"
                secondary={
                  !hasFileHandle
                    ? 'Save or open a workspace file first'
                    : permissionState === 'needs-reconnect'
                    ? (savedFileName ? `Click Reconnect to resume saving to ${savedFileName}` : 'Click Reconnect to resume autosave')
                    : reconnectError === 'not-found'
                    ? 'Original file was moved or deleted — use Save Workspace to pick a new location'
                    : reconnectError === 'denied'
                    ? 'Permission denied — use Save Workspace to pick a new location'
                    : 'Saves to file on every change'
                }
              />
            </MenuItem>
          )}
        </Menu>

        {/* Hidden file input for open fallback */}
        <input
          id={openFileInputId}
          type="file"
          accept=".idcard,.json,application/json"
          style={{ display: 'none' }}
          onChange={handleOpenFileChange}
        />

        {/* ---- Open error dialog ---- */}
        <Dialog open={Boolean(openError)} onClose={() => setOpenError(null)}>
          <DialogTitle>Could Not Open Workspace</DialogTitle>
          <DialogContent>
            <Typography color="error">{openError}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenError(null)}>OK</Button>
          </DialogActions>
        </Dialog>

        {/* ---- Template sync failure (opened file) ---- */}
        <Snackbar
          open={templateSyncError !== null}
          autoHideDuration={8000}
          onClose={() => setTemplateSyncError(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setTemplateSyncError(null)}>
            {templateSyncError}
          </Alert>
        </Snackbar>

        {/* ---- Delete-from-disk failure ---- */}
        <Snackbar
          open={deleteFileError !== null}
          autoHideDuration={8000}
          onClose={() => setDeleteFileError(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setDeleteFileError(null)}>
            {deleteFileError}
          </Alert>
        </Snackbar>

        {/* ---- Reconnect banner ---- */}
        <Snackbar
          open={hasFileHandle && permissionState === 'needs-reconnect' && !bannerDismissed}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={reconnectError ? 'error' : 'warning'}
            variant="filled"
            onClose={() => setBannerDismissed(true)}
            action={
              <Button color="inherit" size="small" onClick={() => void handleReconnect()}>
                Reconnect
              </Button>
            }
            sx={{ alignItems: 'center' }}
          >
            {reconnectError === 'not-found'
              ? 'Original file was moved or deleted — use Save Workspace to pick a new location.'
              : reconnectError === 'denied'
              ? 'Permission denied — use Save Workspace to pick a new location.'
              : savedFileName
              ? `Reconnect to resume saving to ${savedFileName}`
              : 'Reconnect to resume autosave'}
          </Alert>
        </Snackbar>

        {/* ---- Unsaved workspace guard dialog ---- */}
        <Dialog open={pendingSwitchId !== null} disableEscapeKeyDown maxWidth="xs" fullWidth>
          <DialogTitle>Workspace not saved</DialogTitle>
          <DialogContent>
            <Typography>
              This workspace is not linked to a file. If you switch away now, any unsaved changes will only remain in the browser. Save it first to keep a permanent copy.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleUnsavedSwitchAnyway} color="inherit">Switch without saving</Button>
            <Button onClick={handleUnsavedSaveAndSwitch} variant="contained">Save &amp; switch</Button>
          </DialogActions>
        </Dialog>

        {/* ---- First-launch setup dialog ---- */}
        <Dialog open={Boolean(needsSetup)} disableEscapeKeyDown maxWidth="sm" fullWidth>
          {setupStep === 'choose' ? (
            <>
              <DialogTitle>Welcome to ID Card Generator</DialogTitle>
              <DialogContent>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                  Start by creating a new workspace or opening an existing one.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<Add />}
                    onClick={() => { setSetupStep('naming'); setNewName(''); setNewLogo(null); }}
                    fullWidth
                  >
                    Create New Workspace
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<FolderOpenOutlined />}
                    onClick={handleOpenWorkspace}
                    fullWidth
                  >
                    Open Existing Workspace
                  </Button>
                </Box>
              </DialogContent>
            </>
          ) : (
            <>
              <DialogTitle>New Workspace</DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  fullWidth
                  label="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewWorkspaceConfirm()}
                  placeholder="e.g. Conference badges"
                  sx={{ mt: 1, mb: 2 }}
                />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Logo (optional)
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {newLogo ? (
                    <>
                      <Avatar src={newLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                      <Button component="label" size="small" sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: '0.8125rem' }}>
                        Change
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewLogo)} />
                      </Button>
                      <Button size="small" color="secondary" onClick={() => setNewLogo(null)}>Remove</Button>
                    </>
                  ) : (
                    <Button component="label" variant="outlined" size="small" startIcon={<Image sx={{ fontSize: '1rem' }} />}>
                      Choose Image
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewLogo)} />
                    </Button>
                  )}
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setSetupStep('choose')}>Back</Button>
                <Button variant="contained" onClick={handleNewWorkspaceConfirm} disabled={!newName.trim()}>
                  Save to File & Create
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>

        {/* ---- New workspace dialog ---- */}
        <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNewWorkspaceConfirm()}
              placeholder="e.g. Conference badges"
              sx={{ mt: 1, mb: 2 }}
            />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Logo (optional)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {newLogo ? (
                <>
                  <Avatar src={newLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button component="label" size="small" sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: '0.8125rem' }}>
                    Change
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewLogo)} />
                  </Button>
                  <Button size="small" color="secondary" onClick={() => setNewLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button component="label" variant="outlined" size="small" startIcon={<Image sx={{ fontSize: '1rem' }} />}>
                  Choose Image
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewLogo)} />
                </Button>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleNewWorkspaceConfirm} disabled={!newName.trim()}>Create</Button>
          </DialogActions>
        </Dialog>

        {/* ---- New sub-workspace dialog ---- */}
        <Dialog open={newSubOpen} onClose={() => setNewSubOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CreateNewFolder fontSize="small" color="primary" />
              New Sub-workspace
            </Box>
            {newSubParentId && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Under: {workspaceList.find((w) => w.id === newSubParentId)?.name}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent>
            <TextField
              inputRef={newSubNameInputRef}
              fullWidth
              label="Name"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleNewSubWorkspaceConfirm(); }}
              placeholder="e.g. VIP Guests"
              sx={{ mt: 1, mb: 1.5 }}
            />
            {newSubError && (
              <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setNewSubError(null)}>
                {newSubError}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The card template and print settings will be inherited from the parent workspace.
              You can update them later in the Design step.
            </Typography>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Logo (optional)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {newSubLogo ? (
                <>
                  <Avatar src={newSubLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button component="label" size="small" sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: '0.8125rem' }}>
                    Change
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewSubLogo)} />
                  </Button>
                  <Button size="small" color="secondary" onClick={() => setNewSubLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button component="label" variant="outlined" size="small" startIcon={<Image sx={{ fontSize: '1rem' }} />}>
                  Choose Image
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setNewSubLogo)} />
                </Button>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewSubOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => void handleNewSubWorkspaceConfirm()} disabled={!newSubName.trim()}>
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {/* ---- Edit workspace dialog ---- */}
        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Workspace</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditConfirm()}
              sx={{ mt: 1, mb: 2 }}
            />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Logo</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {editLogo ? (
                <>
                  <Avatar src={editLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button component="label" size="small" sx={{ minWidth: 0, p: 0, textTransform: 'none', fontSize: '0.8125rem' }}>
                    Change
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setEditLogo)} />
                  </Button>
                  <Button size="small" color="secondary" onClick={() => setEditLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button component="label" variant="outlined" size="small" startIcon={<Image sx={{ fontSize: '1rem' }} />}>
                  Choose Image
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={makeLogoHandler(setEditLogo)} />
                </Button>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleEditConfirm}>Save</Button>
          </DialogActions>
        </Dialog>

        {/* ---- Duplicate root workspace dialog ---- */}
        <Dialog open={dupRootOpen} onClose={() => setDupRootOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ContentCopy fontSize="small" color="primary" />
              Duplicate Workspace
            </Box>
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Name for the duplicate"
              value={dupRootName}
              onChange={(e) => setDupRootName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDupRootConfirm()}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDupRootOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleDupRootConfirm} disabled={!dupRootName.trim()}>
              Duplicate
            </Button>
          </DialogActions>
        </Dialog>

        {/* ---- Duplicate sub-workspace dialog ---- */}
        <Dialog open={dupSubOpen} onClose={() => setDupSubOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ContentCopy fontSize="small" color="primary" />
              Duplicate Sub-workspace
            </Box>
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Name for the duplicate"
              value={dupSubName}
              onChange={(e) => setDupSubName(e.target.value)}
              sx={{ mt: 1, mb: 2 }}
            />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Place duplicate under:
            </Typography>
            <RadioGroup
              value={dupSubLocation}
              onChange={(e) => setDupSubLocation(e.target.value as 'same' | 'different' | 'new')}
            >
              <FormControlLabel
                value="same"
                control={<Radio size="small" />}
                label={`Same workspace (${workspaceList.find((w) => w.id === currentMeta?.parentId)?.name ?? 'current parent'})`}
              />
              <FormControlLabel
                value="different"
                control={<Radio size="small" />}
                label="Different workspace"
              />
              {dupSubLocation === 'different' && (
                <FormControl size="small" sx={{ ml: 3.5, mt: 0.5, mb: 1, minWidth: 220 }}>
                  <InputLabel>Workspace</InputLabel>
                  <Select
                    value={dupSubTargetParentId}
                    label="Workspace"
                    onChange={(e) => setDupSubTargetParentId(e.target.value)}
                    native={false}
                  >
                    {otherRootWorkspaces.map((w) => (
                      <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControlLabel
                value="new"
                control={<Radio size="small" />}
                label="New workspace"
              />
              {dupSubLocation === 'new' && (
                <TextField
                  size="small"
                  label="New workspace name"
                  value={dupSubNewParentName}
                  onChange={(e) => setDupSubNewParentName(e.target.value)}
                  sx={{ ml: 3.5, mt: 0.5, mb: 1, width: 220 }}
                />
              )}
            </RadioGroup>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDupSubOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleDupSubConfirm}
              disabled={
                !dupSubName.trim() ||
                (dupSubLocation === 'different' && !dupSubTargetParentId) ||
                (dupSubLocation === 'new' && !dupSubNewParentName.trim())
              }
            >
              Duplicate
            </Button>
          </DialogActions>
        </Dialog>

        {/* ---- Delete confirmation ---- */}
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
          <DialogTitle>Delete Workspace?</DialogTitle>
          <DialogContent>
            {currentChildren.length > 0 ? (
              <>
                <Typography gutterBottom>
                  This will permanently delete &quot;{currentMeta?.name}&quot; and its{' '}
                  {currentChildren.length} sub-workspace{currentChildren.length !== 1 ? 's' : ''}:
                </Typography>
                <Box component="ul" sx={{ pl: 2, mt: 0.5, mb: 1 }}>
                  {currentChildren.map((c) => (
                    <li key={c.id}>
                      <Typography variant="body2">{c.name}</Typography>
                    </li>
                  ))}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  You cannot undo this.
                </Typography>
              </>
            ) : (
              <Typography>
                This will permanently delete &quot;{currentMeta?.name}&quot; and its saved data.
                You cannot undo this.
              </Typography>
            )}
            {deletingLinkedFile && (
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Checkbox
                    checked={deleteFileFromDisk}
                    onChange={(e) => setDeleteFileFromDisk(e.target.checked)}
                  />
                }
                label={`Also delete ${savedFileName ?? 'the linked file'} from disk`}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ClickAwayListener>
  );
}
