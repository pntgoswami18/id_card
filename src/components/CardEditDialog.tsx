import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import CardCanvas from './CardCanvas';
import type { CardRecord, Template } from '../types';

interface BindingDef {
  elementId: string;
  binding: string;
  isImage?: boolean;
}

interface CardEditDialogProps {
  open: boolean;
  onClose: () => void;
  record: CardRecord | null;
  bindings: BindingDef[];
  onSave: (overrides: Record<string, string | null>, fontSizeOverrides: Record<string, number | null>) => void;
  onTakePhoto: () => void;
  onPhotoReady: (dataUrl: string, name: string) => void;
  photoDisplayNames: Record<string, string>;
  template: Template;
  printSettings: { widthMm: number; heightMm: number; orientation: 'portrait' | 'landscape' };
}

function getValue(record: CardRecord | null, binding: string): string {
  if (!record) return '';
  const v = record.overrides[binding] ?? record.data[binding];
  return v ?? '';
}

const MM_TO_PX = 3.7795275591;
const PREVIEW_MAX_WIDTH = 420;

export default function CardEditDialog({
  open,
  onClose,
  record,
  bindings,
  onSave,
  onTakePhoto,
  onPhotoReady,
  photoDisplayNames,
  template,
  printSettings,
}: CardEditDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  // null = no override (auto-fit); number = fixed size in pt
  const [fontSizes, setFontSizes] = useState<Record<string, number | null>>({});

  const wMm = printSettings.orientation === 'portrait' ? printSettings.heightMm : printSettings.widthMm;
  const hMm = printSettings.orientation === 'portrait' ? printSettings.widthMm : printSettings.heightMm;
  const canvasWidthPx = wMm * MM_TO_PX;
  const canvasHeightPx = hMm * MM_TO_PX;
  const previewWidth = Math.min(PREVIEW_MAX_WIDTH, canvasWidthPx);
  const scale = previewWidth / canvasWidthPx;
  const previewHeight = canvasHeightPx * scale;

  const previewRecord = useMemo<CardRecord>(() => ({
    id: record?.id ?? '__preview__',
    data: record?.data ?? {},
    overrides: values,
    fontSizeOverrides: fontSizes as Record<string, number>,
  }), [record, values, fontSizes]);
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
    reader.onerror = () => {
      alert('Failed to read the image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!record) return;
    const nextValues: Record<string, string> = {};
    const nextSizes: Record<string, number | null> = {};
    bindings.forEach(({ binding }) => {
      nextValues[binding] = getValue(record, binding);
      nextSizes[binding] = record.fontSizeOverrides?.[binding] ?? null;
    });
    setValues(nextValues);
    setFontSizes(nextSizes);
  }, [record, bindings, open]);

  const handleChange = (binding: string, value: string) => {
    setValues((prev) => ({ ...prev, [binding]: value }));
  };

  const handleFontSizeChange = (binding: string, raw: string) => {
    if (raw === '') {
      setFontSizes((prev) => ({ ...prev, [binding]: null }));
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 4 && n <= 144) {
      setFontSizes((prev) => ({ ...prev, [binding]: n }));
    }
  };

  const handleSave = () => {
    const overrides: Record<string, string | null> = {};
    const fontSizeOverrides: Record<string, number | null> = {};
    bindings.forEach(({ binding }) => {
      overrides[binding] = values[binding] || null;
      fontSizeOverrides[binding] = fontSizes[binding] ?? null;
    });
    onSave(overrides, fontSizeOverrides);
    onClose();
  };

  if (!record) return null;

  const textBindings = bindings.filter((b) => !b.isImage);
  const hasTextBindings = textBindings.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Card</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 3, pt: 1, alignItems: 'flex-start' }}>
          {/* Live card preview */}
          <Box
            sx={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: previewWidth,
                height: previewHeight,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 1,
                boxShadow: 3,
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: canvasWidthPx,
                  height: canvasHeightPx,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <CardCanvas
                  template={template}
                  record={previewRecord}
                  widthMm={wMm}
                  heightMm={hMm}
                  designMode={false}
                />
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Live preview
            </Typography>
          </Box>

          {/* Form fields */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
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

            const sizeVal = fontSizes[binding];
            return (
              <Box key={binding} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    fullWidth
                    size="small"
                    label={binding}
                    value={value}
                    onChange={(e) => handleChange(binding, e.target.value)}
                  />
                  <TextField
                    size="small"
                    label="Size"
                    value={sizeVal ?? ''}
                    onChange={(e) => handleFontSizeChange(binding, e.target.value)}
                    placeholder="Auto"
                    type="number"
                    inputProps={{ min: 4, max: 144, step: 1, onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur() }}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">pt</InputAdornment>,
                    }}
                    sx={{ width: 110, flexShrink: 0 }}
                    title="Leave empty to auto-fit text"
                  />
                </Box>
                {sizeVal != null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ cursor: 'pointer', alignSelf: 'flex-end', '&:hover': { color: 'primary.main' } }}
                    onClick={() => setFontSizes((prev) => ({ ...prev, [binding]: null }))}
                  >
                    Reset to auto-fit
                  </Typography>
                )}
              </Box>
            );
          })}

          {hasTextBindings && (
            <Typography variant="caption" color="text.secondary">
              Font size — leave empty to auto-fit text to its box; enter a value to fix the size.
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" fullWidth onClick={onTakePhoto}>
              Take Photo
            </Button>
            <Button component="label" variant="outlined" fullWidth>
              Upload Photo
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Button>
          </Box>
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
