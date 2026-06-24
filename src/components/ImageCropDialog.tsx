import { useState, useRef, useEffect, useCallback } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface DragState {
  mode: 'move' | Handle;
  startClientX: number;
  startClientY: number;
  origRect: CropRect;
}

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCrop: (croppedDataUrl: string) => void;
}

const HANDLE_SIZE = 10;

const HANDLES: { id: Handle; cursor: string; style: React.CSSProperties }[] = [
  { id: 'nw', cursor: 'nw-resize', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { id: 'n',  cursor: 'n-resize',  style: { top: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)' } },
  { id: 'ne', cursor: 'ne-resize', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { id: 'e',  cursor: 'e-resize',  style: { top: '50%', right: -HANDLE_SIZE / 2, transform: 'translateY(-50%)' } },
  { id: 'se', cursor: 'se-resize', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
  { id: 's',  cursor: 's-resize',  style: { bottom: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)' } },
  { id: 'sw', cursor: 'sw-resize', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
  { id: 'w',  cursor: 'w-resize',  style: { top: '50%', left: -HANDLE_SIZE / 2, transform: 'translateY(-50%)' } },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function ImageCropDialog({ open, imageSrc, onClose, onCrop }: ImageCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<CropRect>({ left: 0, top: 0, right: 100, bottom: 100 });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (open) setRect({ left: 0, top: 0, right: 100, bottom: 100 });
  }, [open, imageSrc]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, mode: 'move' | Handle) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, origRect: rect };
    },
    [rect],
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const img = imgRef.current;
    if (!img) return;
    const b = img.getBoundingClientRect();
    const dx = ((e.clientX - drag.startClientX) / b.width) * 100;
    const dy = ((e.clientY - drag.startClientY) / b.height) * 100;
    const MIN = 5;
    const o = drag.origRect;

    if (drag.mode === 'move') {
      const w = o.right - o.left;
      const h = o.bottom - o.top;
      const l = clamp(o.left + dx, 0, 100 - w);
      const t = clamp(o.top + dy, 0, 100 - h);
      setRect({ left: l, top: t, right: l + w, bottom: t + h });
      return;
    }

    let { left, top, right, bottom } = o;
    const m = drag.mode;
    if (m.includes('w')) left  = clamp(o.left  + dx, 0,       o.right  - MIN);
    if (m.includes('e')) right = clamp(o.right + dx, o.left   + MIN,    100);
    if (m.includes('n')) top   = clamp(o.top   + dy, 0,       o.bottom - MIN);
    if (m.includes('s')) bottom= clamp(o.bottom+ dy, o.top    + MIN,    100);
    setRect({ left, top, right, bottom });
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    if (!open || !imageSrc) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [open, imageSrc, handleMouseMove, handleMouseUp]);

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img || !imageSrc) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const sx = (rect.left  / 100) * nw;
    const sy = (rect.top   / 100) * nh;
    const sw = ((rect.right  - rect.left) / 100) * nw;
    const sh = ((rect.bottom - rect.top)  / 100) * nh;
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext('2d')?.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onCrop(canvas.toDataURL('image/jpeg', 0.92));
  };

  if (!imageSrc) return null;

  const { left, top, right, bottom } = rect;
  const cw = right - left;
  const ch = bottom - top;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Crop Photo</DialogTitle>
      <DialogContent sx={{ p: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, textAlign: 'center' }}>
          Drag the handles to adjust the crop area
        </Typography>
        <Box sx={{ position: 'relative', lineHeight: 0, userSelect: 'none' }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="crop preview"
            style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
          />

          {/* Dark overlay: four panels surrounding the crop box */}
          <Box sx={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, height: `${top}%`, bgcolor: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', left: 0, right: 0, top: `${bottom}%`, bottom: 0, bgcolor: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', top: `${top}%`, left: 0, width: `${left}%`, height: `${ch}%`, bgcolor: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', top: `${top}%`, left: `${right}%`, right: 0, height: `${ch}%`, bgcolor: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />

          {/* Crop box */}
          <Box
            sx={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: `${cw}%`,
              height: `${ch}%`,
              border: '2px solid rgba(255,255,255,0.9)',
              boxSizing: 'border-box',
              cursor: 'move',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
          >
            {/* Rule-of-thirds guide lines */}
            {[1, 2].map((i) => (
              <Box key={`v${i}`} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / 3) * 100}%`, width: '1px', bgcolor: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
            ))}
            {[1, 2].map((i) => (
              <Box key={`h${i}`} sx={{ position: 'absolute', left: 0, right: 0, top: `${(i / 3) * 100}%`, height: '1px', bgcolor: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
            ))}

            {/* Resize handles */}
            {HANDLES.map(({ id, cursor, style }) => (
              <Box
                key={id}
                sx={{
                  position: 'absolute',
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  bgcolor: 'white',
                  border: '1px solid rgba(0,0,0,0.35)',
                  borderRadius: '2px',
                  cursor,
                  ...style,
                }}
                onMouseDown={(e) => handleMouseDown(e, id)}
              />
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setRect({ left: 0, top: 0, right: 100, bottom: 100 })}>
          Reset
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCrop} autoFocus>
          Use Photo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
