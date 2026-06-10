import { useState, useRef } from 'react';
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
import Avatar from '@mui/material/Avatar';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Image from '@mui/icons-material/Image';
import SaveAlt from '@mui/icons-material/SaveAlt';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import type { WorkspaceMeta, WorkspaceData } from '../utils/workspaceStorage';
import {
  getWorkspaceList,
  getWorkspaceData,
  createWorkspace,
  deleteWorkspace,
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
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const newLogoInputRef = useRef<HTMLInputElement>(null);
  const editLogoInputRef = useRef<HTMLInputElement>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);

  const currentMeta = workspaceList.find((w) => w.id === currentWorkspaceId);
  const currentName = currentMeta?.name ?? 'Workspace';
  const currentLogo = currentWorkspaceLogo ?? currentMeta?.logo;

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl((prev) => (prev ? null : e.currentTarget));
  };
  const handleClose = () => setAnchorEl(null);

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

  const handleEditOpen = () => {
    setEditName(currentName); setEditLogo(currentLogo ?? null); setEditOpen(true); handleClose();
  };

  const handleEditConfirm = () => {
    if (!currentWorkspaceId) return;
    const name = editName.trim() || currentName;
    const logo = editLogo ?? undefined;
    renameWorkspace(currentWorkspaceId, name);
    updateWorkspaceMeta(currentWorkspaceId, { logo });
    onSetWorkspaceLogo(logo);
    onSaveCurrent({ logo });
    const list = getWorkspaceList();
    onSetWorkspaceList(list.workspaces);
    setEditOpen(false); setEditName(''); setEditLogo(null);
  };

  const handleDeleteOpen = () => { setDeleteOpen(true); handleClose(); };

  const handleDeleteConfirm = () => {
    if (!currentWorkspaceId) return;
    onSaveCurrent();
    deleteWorkspace(currentWorkspaceId);
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
      const handle = await saveWorkspaceWithPicker(currentName, currentWorkspaceData);
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

  return (
    <ClickAwayListener onClickAway={() => anchorEl != null && handleClose()}>
      <Box>
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
          {currentName}
        </Button>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {workspaceList.map((w) => (
            <MenuItem key={w.id} selected={w.id === currentWorkspaceId} onClick={() => handleSwitch(w.id)}>
              {w.logo ? (
                <Avatar src={w.logo} sx={{ width: 24, height: 24, mr: 1.5 }} variant="rounded" />
              ) : (
                <ListItemIcon sx={{ minWidth: 40 }}><FolderOpen fontSize="small" /></ListItemIcon>
              )}
              <ListItemText primary={w.name} />
            </MenuItem>
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

          {/* Autosave toggle — only meaningful when File System Access API is available */}
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

        {/* Hidden file input for open (fallback when showOpenFilePicker unavailable) */}
        <input
          ref={openFileInputRef}
          type="file"
          accept=".idcard,.json,application/json"
          style={{ display: 'none' }}
          onChange={handleOpenFileChange}
        />

        {/* Open error dialog */}
        <Dialog open={Boolean(openError)} onClose={() => setOpenError(null)}>
          <DialogTitle>Could Not Open Workspace</DialogTitle>
          <DialogContent>
            <Typography color="error">{openError}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenError(null)}>OK</Button>
          </DialogActions>
        </Dialog>

        {/* New workspace dialog */}
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
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
                  if (file.size > 1 * 1024 * 1024) { alert('Logo must be under 1 MB.'); return; }
                  setNewLogo(await readFileAsDataUrl(file));
                }}
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

        {/* Edit workspace dialog */}
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
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
                  if (file.size > 1 * 1024 * 1024) { alert('Logo must be under 1 MB.'); return; }
                  setEditLogo(await readFileAsDataUrl(file));
                }}
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

        {/* Delete confirmation */}
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
          <DialogTitle>Delete Workspace?</DialogTitle>
          <DialogContent>
            <Typography>
              This will permanently delete &quot;{currentName}&quot; and its saved data. You cannot undo this.
            </Typography>
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
