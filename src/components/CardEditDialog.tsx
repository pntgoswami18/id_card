import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import type { CardRecord } from '../types';

interface CardEditDialogProps {
  open: boolean;
  onClose: () => void;
  record: CardRecord | null;
  bindings: { elementId: string; binding: string }[];
  onSave: (overrides: Record<string, string | null>) => void;
  onTakePhoto: () => void;
}

function getValue(record: CardRecord | null, binding: string): string {
  if (!record) return '';
  const v = record.overrides[binding] ?? record.data[binding];
  return v ?? '';
}

export default function CardEditDialog({
  open,
  onClose,
  record,
  bindings,
  onSave,
  onTakePhoto,
}: CardEditDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!record) return;
    const next: Record<string, string> = {};
    bindings.forEach(({ binding }) => {
      next[binding] = getValue(record, binding);
    });
    setValues(next);
  }, [record, bindings, open]);

  const handleChange = (binding: string, value: string) => {
    setValues((prev) => ({ ...prev, [binding]: value }));
  };

  const handleSave = () => {
    const overrides: Record<string, string | null> = {};
    bindings.forEach(({ binding }) => {
      const v = values[binding] ?? '';
      overrides[binding] = v || null;
    });
    onSave(overrides);
    onClose();
  };

  if (!record) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Card</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {bindings.map(({ binding }) => (
            <TextField
              key={binding}
              fullWidth
              size="small"
              label={binding}
              value={values[binding] ?? ''}
              onChange={(e) => handleChange(binding, e.target.value)}
            />
          ))}
          <Button variant="outlined" onClick={onTakePhoto}>
            Take Photo
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
