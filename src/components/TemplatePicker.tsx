import { useState, useEffect, useRef } from 'react';
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
import Divider from '@mui/material/Divider';
import DeleteIcon from '@mui/icons-material/Delete';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import { BUILT_IN_TEMPLATES } from '../constants/templates';
import { loadUserTemplates, deleteUserTemplate, saveUserTemplate } from '../utils/userTemplates';
import {
  openTemplateWithPicker,
  readTemplateFile,
  hasOpenFilePicker,
} from '../utils/workspaceFile';
import type { Template, UserTemplateMeta } from '../types';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: Template, source: { type: 'built-in'; id: string } | { type: 'user'; id: string }) => void;
  onAfterDelete?: (deletedId: string) => void;
}

export default function TemplatePicker({ open, onClose, onSelect, onAfterDelete }: TemplatePickerProps) {
  const [userTemplates, setUserTemplates] = useState(() => loadUserTemplates());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Refresh template list every time the dialog opens
  useEffect(() => {
    if (open) setUserTemplates(loadUserTemplates());
  }, [open]);

  const handleSelectBuiltIn = (t: Template) => {
    onSelect(t, { type: 'built-in', id: t.id });
    onClose();
  };

  const handleSelectUser = (meta: UserTemplateMeta, template: Template) => {
    onSelect(template, { type: 'user', id: meta.id });
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
    // Save to localStorage so it persists in "My templates"
    saveUserTemplate(t);
    setUserTemplates(loadUserTemplates());
    onSelect(t, { type: 'user', id: t.id });
    onClose();
  };

  const handleImportFromFile = async () => {
    if (hasOpenFilePicker()) {
      const file = await openTemplateWithPicker();
      if (file) {
        importAndSelect(file.template);
      }
    } else {
      importInputRef.current?.click();
    }
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

        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
          Built-in templates
        </Typography>
        <List dense>
          {BUILT_IN_TEMPLATES.map((t) => (
            <ListItemButton key={t.id} onClick={() => handleSelectBuiltIn(t)}>
              <ListItemText primary={t.name} secondary={`${t.elements.length} elements`} />
            </ListItemButton>
          ))}
        </List>

        {userTemplates.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
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
                  <ListItemButton onClick={() => handleSelectUser(meta, template)}>
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
        <Button
          startIcon={<FileOpenIcon />}
          onClick={handleImportFromFile}
          variant="outlined"
          size="small"
        >
          Import from file
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Hidden fallback file input for browsers without FSA */}
      <input
        ref={importInputRef}
        type="file"
        accept=".idtemplate,.json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportInputChange}
      />

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
