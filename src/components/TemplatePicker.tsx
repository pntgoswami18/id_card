import { useState } from 'react';
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
import { BUILT_IN_TEMPLATES } from '../constants/templates';
import { loadUserTemplates, deleteUserTemplate } from '../utils/userTemplates';
import type { Template, UserTemplateMeta } from '../types';

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: Template, source: { type: 'built-in'; id: string } | { type: 'user'; id: string }) => void;
  onAfterDelete?: (deletedId: string) => void;
}

export default function TemplatePicker({ open, onClose, onSelect, onAfterDelete }: TemplatePickerProps) {
  const [refresh, setRefresh] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const userTemplates = loadUserTemplates();

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
    onAfterDelete?.(deleteConfirm.id);
    setDeleteConfirm(null);
    setRefresh((r) => r + 1);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start From Template</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Saved templates are available in all workspaces.
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
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 0.5 }}>
              My templates
            </Typography>
            <List dense key={refresh}>
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
                    <ListItemText primary={meta.name} secondary={new Date(meta.savedAt).toLocaleDateString()} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>

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
    </Dialog>
  );
}
