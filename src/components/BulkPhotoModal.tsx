import { useState, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

type Photo = { name: string; dataUrl: string };

interface BulkPhotoModalProps {
  photos: Photo[];
  recordCount: number;
  onConfirm: (orderedPhotos: Photo[]) => void;
  onClose: () => void;
}

export default function BulkPhotoModal({ photos, recordCount, onConfirm, onClose }: BulkPhotoModalProps) {
  const [order, setOrder] = useState<Photo[]>(() => [...photos]);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleSort = (_: React.MouseEvent, value: 'asc' | 'desc' | null) => {
    if (!value) return;
    setSortDir(value);
    setOrder((prev) =>
      [...prev].sort((a, b) =>
        value === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      )
    );
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }
    setOrder((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, removed);
      return next;
    });
    setSortDir(null);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleRemove = (index: number) => {
    setOrder((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReselectFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;
    files.sort((a, b) => a.name.localeCompare(b.name));
    Promise.all(
      files.map(
        (file) =>
          new Promise<Photo | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    ).then((results) => {
      const newPhotos = results.filter((r): r is Photo => r !== null);
      if (newPhotos.length > 0) {
        setOrder(newPhotos);
        setSortDir('asc');
      }
    });
  };

  const assignCount = Math.min(order.length, recordCount);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <span>{order.length} photo{order.length !== 1 ? 's' : ''} found</span>
          <ToggleButtonGroup size="small" value={sortDir} exclusive onChange={handleSort}>
            <ToggleButton value="asc">A → Z</ToggleButton>
            <ToggleButton value="desc">Z → A</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {order.map((photo, index) => (
            <Box
              component="li"
              key={photo.name}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1,
                cursor: 'grab',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: dragOverIndex === index ? 'action.hover' : 'transparent',
                '&:last-child': { borderBottom: 'none' },
                userSelect: 'none',
              }}
            >
              <DragIndicatorIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
              <Box
                component="img"
                src={photo.dataUrl}
                alt={photo.name}
                sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0, border: '1px solid', borderColor: 'divider' }}
              />
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {photo.name}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                #{index + 1}
              </Typography>
              <IconButton
                size="small"
                onClick={() => handleRemove(index)}
                sx={{ flexShrink: 0, ml: 0.5 }}
                aria-label={`Remove ${photo.name}`}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Will assign to {assignCount} of {recordCount} card{recordCount !== 1 ? 's' : ''}
          {order.length > recordCount ? ` (${order.length - recordCount} photo${order.length - recordCount !== 1 ? 's' : ''} will be unused)` : ''}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="outlined" onClick={() => folderInputRef.current?.click()}>
            Reselect folder
          </Button>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in standard HTMLInputElement types
            webkitdirectory=""
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleReselectFolder}
          />
          <Button variant="contained" onClick={() => onConfirm(order)} disabled={order.length === 0}>
            Confirm
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
