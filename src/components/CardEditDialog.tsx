import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { CardRecord } from '../types';

interface CardEditDialogProps {
  open: boolean;
  onClose: () => void;
  record: CardRecord | null;
  bindings: { elementId: string; binding: string; isImage?: boolean }[];
  onSave: (overrides: Record<string, string | null>) => void;
  onTakePhoto: () => void;
  onPhotoReady: (dataUrl: string, name: string) => void;
  photoDisplayNames: Record<string, string>;
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
  onPhotoReady,
  photoDisplayNames,
}: CardEditDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be under 10 MB.');
      return;
    }
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') onPhotoReady(result, fileName);
    };
    reader.readAsDataURL(file);
  };

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
          {bindings.map(({ binding, isImage }) => {
            const value = values[binding] ?? '';
            if (isImage) {
              const hasPhoto = value.startsWith('data:image/');
              const displayName = photoDisplayNames[binding];
              return (
                <Box
                  key={binding}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                  }}
                >
                  {hasPhoto && (
                    <Box
                      component="img"
                      src={value}
                      sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }}
                    />
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {binding}
                    </Typography>
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {hasPhoto ? (displayName ?? 'Photo') : '(no photo)'}
                    </Typography>
                  </Box>
                </Box>
              );
            }
            return (
              <TextField
                key={binding}
                fullWidth
                size="small"
                label={binding}
                value={value}
                onChange={(e) => handleChange(binding, e.target.value)}
              />
            );
          })}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" fullWidth onClick={onTakePhoto}>
              Take Photo
            </Button>
            <Button variant="outlined" fullWidth onClick={() => fileInputRef.current?.click()}>
              Upload Photo
            </Button>
          </Box>
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
