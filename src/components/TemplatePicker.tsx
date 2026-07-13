import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import { loadUserTemplates, deleteUserTemplate, saveUserTemplate } from '../utils/userTemplates';
import { resolveTemplateAssets } from '../utils/assetStore';
import {
  readTemplateFile,
} from '../utils/workspaceFile';
import type { Template, UserTemplateMeta } from '../types';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: Template, source: { type: 'user'; id: string }) => void;
  onAfterDelete?: (deletedId: string) => void;
}

export default function TemplatePicker({ open, onClose, onSelect, onAfterDelete }: TemplatePickerProps) {
  const [userTemplates, setUserTemplates] = useState(() => loadUserTemplates());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Refresh template list every time the dialog opens
  useEffect(() => {
    if (open) setUserTemplates(loadUserTemplates());
  }, [open]);

  const handleSelectUser = async (meta: UserTemplateMeta, template: Template) => {
    // Stored templates may hold asset: refs — resolve to data URLs before entering app state.
    onSelect(await resolveTemplateAssets(template), { type: 'user', id: meta.id });
    onClose();
  };

  const handleDeleteClick = (e: React.MouseEvent, meta: UserTemplateMeta) => {
    e.stopPropagation();
    setDeleteConfirm({ id: meta.id, name: meta.name });
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    deleteUserTemplate(deleteConfirm.id);
    setUserTemplates((prev) => prev.filter((t) => t.meta.id !== deleteConfirm.id));
    onAfterDelete?.(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const importAndSelect = (t: Template) => {
    // Assign a fresh id so the import never silently overwrites an existing user template
    const imported: Template = { ...t, id: `user-${Date.now()}` };
    if (!saveUserTemplate(imported)) {
      setImportError(
        'Browser storage is full — the template could not be saved to "My templates". It will still be applied to this workspace.',
      );
    }
    setUserTemplates(loadUserTemplates());
    onSelect(imported, { type: 'user', id: imported.id });
    onClose();
  };

  const handleImportInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const tf = await readTemplateFile(file);
    if (!tf) {
      setImportError('Invalid template file. Please choose a .idtemplate file.');
      return;
    }
    importAndSelect(tf.template);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start From Template</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Templates are available in all workspaces.
        </Typography>

        {userTemplates.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
              My templates
            </Typography>
            <List dense>
              {userTemplates.map(({ meta, template }) => (
                <ListItem
                  key={meta.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={`Delete ${meta.name}`}
                      onClick={(e) => handleDeleteClick(e, meta)}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => void handleSelectUser(meta, template)}>
                    <ListItemText
                      primary={meta.name}
                      secondary={new Date(meta.savedAt).toLocaleDateString()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}

      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Button component="label" variant="outlined" startIcon={<FileOpenIcon />}>
          Import from file
          <input
            type="file"
            accept=".idtemplate,.json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportInputChange}
          />
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          <Typography>
            Delete template &quot;{deleteConfirm?.name ?? ''}&quot;? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import error */}
      <Dialog open={Boolean(importError)} onClose={() => setImportError(null)}>
        <DialogTitle>Import Failed</DialogTitle>
        <DialogContent>
          <Typography color="error">{importError}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportError(null)}>OK</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
