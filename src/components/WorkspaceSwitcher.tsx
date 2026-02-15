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
import Avatar from '@mui/material/Avatar';
import FolderOpen from '@mui/icons-material/FolderOpen';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Image from '@mui/icons-material/Image';
import CloudDownload from '@mui/icons-material/CloudDownload';
import CloudUpload from '@mui/icons-material/CloudUpload';
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
import { downloadBackup, restoreFromBackup, type BackupData } from '../utils/backup';

interface WorkspaceSwitcherProps {
  workspaceList: WorkspaceMeta[];
  currentWorkspaceId: string;
  currentWorkspaceData: WorkspaceData;
  currentWorkspaceLogo?: string;
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
  currentWorkspaceLogo,
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
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const newLogoInputRef = useRef<HTMLInputElement>(null);
  const editLogoInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const currentMeta = workspaceList.find((w) => w.id === currentWorkspaceId);
  const currentName = currentMeta?.name ?? 'Workspace';
  const currentLogo = currentWorkspaceLogo ?? currentMeta?.logo;

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl((prev) => (prev ? null : e.currentTarget));
  };
  const handleClose = () => setAnchorEl(null);

  const handleSwitch = (id: string) => {
    if (id === currentWorkspaceId) {
      handleClose();
      return;
    }
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
    setNewName('');
    setNewLogo(null);
    setNewOpen(true);
    handleClose();
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
    setNewOpen(false);
    setNewName('');
    setNewLogo(null);
  };

  const handleEditOpen = () => {
    setEditName(currentName);
    setEditLogo(currentLogo ?? null);
    setEditOpen(true);
    handleClose();
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
    setEditOpen(false);
    setEditName('');
    setEditLogo(null);
  };

  const handleDeleteOpen = () => {
    setDeleteOpen(true);
    handleClose();
  };

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

  const handleBackup = () => {
    onSaveCurrent();
    downloadBackup();
    handleClose();
  };

  const handleRestoreClick = () => {
    setRestoreError(null);
    restoreInputRef.current?.click();
    handleClose();
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as BackupData;
      const result = restoreFromBackup(backup);
      if (result.ok) {
        window.location.reload();
      } else {
        setRestoreError(result.error);
      }
    } catch {
      setRestoreError('Invalid backup file. Please select a valid JSON backup.');
    }
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
          <MenuItem
            key={w.id}
            selected={w.id === currentWorkspaceId}
            onClick={() => handleSwitch(w.id)}
          >
            {w.logo ? (
              <Avatar src={w.logo} sx={{ width: 24, height: 24, mr: 1.5 }} variant="rounded" />
            ) : (
              <ListItemIcon sx={{ minWidth: 40 }}>
                <FolderOpen fontSize="small" />
              </ListItemIcon>
            )}
            <ListItemText primary={w.name} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleNewWorkspaceClick}>
          <ListItemIcon>
            <Add fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="New workspace" />
        </MenuItem>
        <MenuItem onClick={handleEditOpen}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Edit workspace" />
        </MenuItem>
        <MenuItem
          onClick={handleDeleteOpen}
          disabled={workspaceList.length <= 1}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Delete current" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleBackup}>
          <ListItemIcon>
            <CloudDownload fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Backup Data" />
        </MenuItem>
        <MenuItem onClick={handleRestoreClick}>
          <ListItemIcon>
            <CloudUpload fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Restore From Backup" />
        </MenuItem>
      </Menu>

      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleRestoreFileChange}
      />

      <Dialog open={Boolean(restoreError)} onClose={() => setRestoreError(null)}>
        <DialogTitle>Restore Failed</DialogTitle>
        <DialogContent>
          <Typography color="error">{restoreError}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreError(null)}>OK</Button>
        </DialogActions>
      </Dialog>

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
                if (file) setNewLogo(await readFileAsDataUrl(file));
                e.target.value = '';
              }}
            />
            {newLogo ? (
              <>
                <Avatar src={newLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                <Button size="small" onClick={() => newLogoInputRef.current?.click()}>
                  Change
                </Button>
                <Button size="small" color="secondary" onClick={() => setNewLogo(null)}>
                  Remove
                </Button>
              </>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Image />}
                onClick={() => newLogoInputRef.current?.click()}
              >
                Choose Image
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleNewWorkspaceConfirm} disabled={!newName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

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
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Logo
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              ref={editLogoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setEditLogo(await readFileAsDataUrl(file));
                e.target.value = '';
              }}
            />
            {editLogo ? (
              <>
                <Avatar src={editLogo} sx={{ width: 48, height: 48 }} variant="rounded" />
                <Button size="small" onClick={() => editLogoInputRef.current?.click()}>
                  Change
                </Button>
                <Button size="small" color="secondary" onClick={() => setEditLogo(null)}>
                  Remove
                </Button>
              </>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Image />}
                onClick={() => editLogoInputRef.current?.click()}
              >
                Choose Image
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditConfirm}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Workspace?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete &quot;{currentName}&quot; and its saved data. You cannot
            undo this.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </ClickAwayListener>
  );
}
