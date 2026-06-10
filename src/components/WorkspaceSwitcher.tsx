import React, { useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import FormControlLabel from '@mui/material/FormControlLabel';
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
import Avatar from '@mui/material/Avatar';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Image from '@mui/icons-material/Image';
import SaveAlt from '@mui/icons-material/SaveAlt';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import SubdirectoryArrowRight from '@mui/icons-material/SubdirectoryArrowRight';
import CreateNewFolder from '@mui/icons-material/CreateNewFolder';
import type { WorkspaceMeta, WorkspaceData } from '../utils/workspaceStorage';
import {
  getWorkspaceList,
  getWorkspaceData,
  createWorkspace,
  createSubWorkspace,
  deleteWorkspaceTree,
  renameWorkspace,
  updateWorkspaceMeta,
  setCurrentWorkspace,
  getDefaultWorkspaceData,
  saveWorkspaceData,
} from '../utils/workspaceStorage';
import {
  saveWorkspaceWithPicker,
  openWorkspaceWithPicker,
  readWorkspaceFile,
  hasOpenFilePicker,
  hasSaveFilePicker,
  type WorkspaceFileHandle,
} from '../utils/workspaceFile';

interface WorkspaceSwitcherProps {
  workspaceList: WorkspaceMeta[];
  currentWorkspaceId: string;
  currentWorkspaceData: WorkspaceData;
  currentWorkspaceLogo?: string;
  autoSaveToFile: boolean;
  onAutoSaveToFileChange: (v: boolean) => void;
  fileHandleRef: React.MutableRefObject<WorkspaceFileHandle | null>;
  onSaveCurrent: (overrides?: Partial<WorkspaceData>) => void;
  onLoadWorkspace: (data: WorkspaceData) => void;
  onSetCurrentWorkspace: (id: string) => void;
  onSetWorkspaceList: (list: WorkspaceMeta[]) => void;
  onSetWorkspaceLogo: (logo: string | undefined) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function WorkspaceSwitcher({
  workspaceList,
  currentWorkspaceId,
  currentWorkspaceData,
  currentWorkspaceLogo,
  autoSaveToFile,
  onAutoSaveToFileChange,
  fileHandleRef,
  onSaveCurrent,
  onLoadWorkspace,
  onSetCurrentWorkspace,
  onSetWorkspaceList,
  onSetWorkspaceLogo,
}: WorkspaceSwitcherProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  // new workspace
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState<string | null>(null);
  // new sub-workspace
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubLogo, setNewSubLogo] = useState<string | null>(null);
  const [newSubCopyTemplate, setNewSubCopyTemplate] = useState(true);
  const [newSubParentId, setNewSubParentId] = useState<string | null>(null);
  // edit / delete
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // misc
  const [openError, setOpenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const newLogoInputRef = useRef<HTMLInputElement>(null);
  const newSubLogoInputRef = useRef<HTMLInputElement>(null);
  const editLogoInputRef = useRef<HTMLInputElement>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Derived tree data ----
  const currentMeta = workspaceList.find((w) => w.id === currentWorkspaceId);
  const parentMeta = currentMeta?.parentId
    ? workspaceList.find((w) => w.id === currentMeta.parentId)
    : null;

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
  const handleSwitch = (id: string) => {
    if (id === currentWorkspaceId) { handleClose(); return; }
    onSaveCurrent();
    setCurrentWorkspace(id);
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(id);
    const data = getWorkspaceData(id);
    const toLoad = data ?? getDefaultWorkspaceData();
    onLoadWorkspace({ ...toLoad, logo: toLoad.logo });
    handleClose();
  };

  // ---- New workspace ----
  const handleNewWorkspaceClick = () => {
    setNewName(''); setNewLogo(null); setNewOpen(true); handleClose();
  };

  const handleNewWorkspaceConfirm = () => {
    const name = newName.trim();
    if (!name) return;
    const logo = newLogo ?? undefined;
    onSaveCurrent();
    const meta = createWorkspace(name, logo);
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    const defaultData = getDefaultWorkspaceData();
    onLoadWorkspace({ ...defaultData, logo });
    saveWorkspaceData(meta.id, { ...defaultData, logo });
    setNewOpen(false); setNewName(''); setNewLogo(null);
  };

  // ---- New sub-workspace ----
  const handleNewSubWorkspace = (parentId: string) => {
    setNewSubParentId(parentId);
    setNewSubName('');
    setNewSubLogo(null);
    setNewSubCopyTemplate(true);
    setNewSubOpen(true);
    handleClose();
  };

  const handleNewSubWorkspaceConfirm = () => {
    const name = newSubName.trim();
    if (!name || !newSubParentId) return;
    const logo = newSubLogo ?? undefined;
    onSaveCurrent();
    const meta = createSubWorkspace(name, newSubParentId, logo);
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(meta.id);
    let initialData = getDefaultWorkspaceData();
    if (newSubCopyTemplate) {
      const parentData = getWorkspaceData(newSubParentId);
      if (parentData) {
        initialData = {
          ...initialData,
          template: parentData.template,
          currentTemplateSource: parentData.currentTemplateSource,
          printSettings: parentData.printSettings,
        };
      }
    }
    onLoadWorkspace({ ...initialData, logo });
    saveWorkspaceData(meta.id, { ...initialData, logo });
    setNewSubOpen(false);
    setNewSubName('');
    setNewSubLogo(null);
    setNewSubParentId(null);
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

  const handleEditConfirm = () => {
    if (!currentWorkspaceId) return;
    const name = editName.trim() || (currentMeta?.name ?? 'Workspace');
    const logo = editLogo ?? undefined;
    renameWorkspace(currentWorkspaceId, name);
    updateWorkspaceMeta(currentWorkspaceId, { logo });
    onSetWorkspaceLogo(logo);
    onSaveCurrent({ logo });
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    setEditOpen(false); setEditName(''); setEditLogo(null);
  };

  // ---- Delete ----
  const handleDeleteOpen = () => { setDeleteOpen(true); handleClose(); };

  const handleDeleteConfirm = () => {
    if (!currentWorkspaceId) return;
    onSaveCurrent();
    deleteWorkspaceTree(currentWorkspaceId);
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    onSetCurrentWorkspace(list.currentId);
    const data = getWorkspaceData(list.currentId);
    const toLoad = data ?? getDefaultWorkspaceData();
    onLoadWorkspace({ ...toLoad, logo: toLoad.logo });
    setDeleteOpen(false);
  };

  // ---- Save Workspace ----
  const handleSaveWorkspace = async () => {
    handleClose();
    setSaving(true);
    try {
      onSaveCurrent();
      const handle = await saveWorkspaceWithPicker(buttonLabel, currentWorkspaceData);
      if (handle) fileHandleRef.current = handle;
    } finally {
      setSaving(false);
    }
  };

  // ---- Open Workspace ----
  const handleOpenWorkspace = async () => {
    handleClose();
    if (hasOpenFilePicker()) {
      const wsFile = await openWorkspaceWithPicker();
      if (wsFile) {
        onLoadWorkspace(wsFile.data);
        onSaveCurrent(wsFile.data);
      }
    } else {
      openFileInputRef.current?.click();
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
    onLoadWorkspace(wsFile.data);
    onSaveCurrent(wsFile.data);
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
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {/* Workspace tree — React.Fragment preserves valid ul > li DOM structure */}
          {rootWorkspaces.map((w) => (
            <React.Fragment key={w.id}>
              {/* Parent (root) row */}
              <MenuItem selected={w.id === currentWorkspaceId} onClick={() => handleSwitch(w.id)}>
                {w.logo ? (
                  <Avatar src={w.logo} sx={{ width: 24, height: 24, mr: 1.5 }} variant="rounded" />
                ) : (
                  <ListItemIcon sx={{ minWidth: 40 }}><FolderOpen fontSize="small" /></ListItemIcon>
                )}
                <ListItemText primary={w.name} />
              </MenuItem>

              {/* Children (indented) */}
              {(childrenByParent[w.id] ?? []).map((child) => (
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
              ))}

              {/* Add sub-workspace row */}
              <MenuItem
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
              </MenuItem>
            </React.Fragment>
          ))}

          <Divider />

          <MenuItem onClick={handleNewWorkspaceClick}>
            <ListItemIcon><Add fontSize="small" /></ListItemIcon>
            <ListItemText primary="New workspace" />
          </MenuItem>
          <MenuItem onClick={handleEditOpen}>
            <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
            <ListItemText primary="Edit workspace" />
          </MenuItem>
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
                  : fileHandleRef.current
                  ? 'Overwrite saved file'
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
              onClick={() => onAutoSaveToFileChange(!autoSaveToFile)}
              dense
              sx={{ pl: 1 }}
            >
              <Switch
                size="small"
                checked={autoSaveToFile}
                onChange={(e) => { e.stopPropagation(); onAutoSaveToFileChange(e.target.checked); }}
                sx={{ mr: 1 }}
              />
              <ListItemText
                primary="Autosave"
                secondary={
                  fileHandleRef.current
                    ? 'Saves to file on every change'
                    : 'Save workspace first to enable'
                }
              />
            </MenuItem>
          )}
        </Menu>

        {/* Hidden file input for open fallback */}
        <input
          ref={openFileInputRef}
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
              <input
                ref={newLogoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={makeLogoHandler(setNewLogo)}
              />
              {newLogo ? (
                <>
                  <Avatar src={newLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button size="small" onClick={() => newLogoInputRef.current?.click()}>Change</Button>
                  <Button size="small" color="secondary" onClick={() => setNewLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button size="small" variant="outlined" startIcon={<Image />} onClick={() => newLogoInputRef.current?.click()}>
                  Choose Image
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
              autoFocus
              fullWidth
              label="Name"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNewSubWorkspaceConfirm()}
              placeholder="e.g. VIP Guests"
              sx={{ mt: 1, mb: 1.5 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={newSubCopyTemplate}
                  onChange={(e) => setNewSubCopyTemplate(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Copy card template &amp; print settings from parent
                </Typography>
              }
              sx={{ mb: 2 }}
            />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Logo (optional)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input
                ref={newSubLogoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={makeLogoHandler(setNewSubLogo)}
              />
              {newSubLogo ? (
                <>
                  <Avatar src={newSubLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button size="small" onClick={() => newSubLogoInputRef.current?.click()}>Change</Button>
                  <Button size="small" color="secondary" onClick={() => setNewSubLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button size="small" variant="outlined" startIcon={<Image />} onClick={() => newSubLogoInputRef.current?.click()}>
                  Choose Image
                </Button>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewSubOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleNewSubWorkspaceConfirm} disabled={!newSubName.trim()}>
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
              <input
                ref={editLogoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={makeLogoHandler(setEditLogo)}
              />
              {editLogo ? (
                <>
                  <Avatar src={editLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                  <Button size="small" onClick={() => editLogoInputRef.current?.click()}>Change</Button>
                  <Button size="small" color="secondary" onClick={() => setEditLogo(null)}>Remove</Button>
                </>
              ) : (
                <Button size="small" variant="outlined" startIcon={<Image />} onClick={() => editLogoInputRef.current?.click()}>
                  Choose Image
                </Button>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleEditConfirm}>Save</Button>
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
