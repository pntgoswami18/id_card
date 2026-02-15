import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import type { BackgroundConfig, BackgroundType, WatermarkConfig, WatermarkType } from '../types';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface BackgroundWatermarkPanelProps {
  background: BackgroundConfig | null;
  watermark: WatermarkConfig | null;
  onBackgroundChange: (bg: BackgroundConfig | null) => void;
  onWatermarkChange: (wm: WatermarkConfig | null) => void;
  /** Called when user clicks Done in watermark mode (exits watermark mode). */
  onDone?: () => void;
  /** Called when user enters the Watermark tab (enters watermark mode). */
  onWatermarkModeEnter?: () => void;
}

export default function BackgroundWatermarkPanel({
  background,
  watermark,
  onBackgroundChange,
  onWatermarkChange,
  onDone,
  onWatermarkModeEnter,
}: BackgroundWatermarkPanelProps) {
  const [tab, setTab] = useState(0);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 1) onWatermarkModeEnter?.();
  }, [tab, onWatermarkModeEnter]);

  const handleBackgroundFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onBackgroundChange({
        type: 'image',
        value: dataUrl,
        imageFileName: file.name,
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleWatermarkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onWatermarkChange(
        watermark
          ? { ...watermark, type: 'image', value: dataUrl, imageFileName: file.name }
          : { type: 'image', value: dataUrl, imageFileName: file.name, opacity: 0.2, position: 'center' }
      );
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Background" />
        <Tab label="Watermark" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ pt: 2 }}>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={background?.type ?? 'solid'}
              label="Type"
              onChange={(e) => {
                const t = e.target.value as BackgroundType;
                if (!background) {
                  onBackgroundChange({
                    type: t,
                    value: t === 'solid' ? '#f5f5f5' : t === 'gradient' ? '#4A90D9' : '',
                    ...(t === 'gradient' && { gradientColor2: '#357ABD', gradientDirection: 'to bottom' }),
                  });
                } else {
                  onBackgroundChange({ ...background, type: t });
                }
              }}
            >
              <MenuItem value="solid">Solid Color</MenuItem>
              <MenuItem value="gradient">Gradient</MenuItem>
              <MenuItem value="image">Image</MenuItem>
            </Select>
          </FormControl>

          {(background?.type ?? 'solid') === 'solid' && (
            <TextField
              fullWidth
              size="small"
              label="Color"
              type="color"
              value={background?.value ?? '#f5f5f5'}
              onChange={(e) => onBackgroundChange({ type: 'solid', value: e.target.value })}
              sx={{ '& input': { height: 40 } }}
            />
          )}

          {(background?.type ?? 'solid') === 'gradient' && (
            <>
              <TextField
                fullWidth
                size="small"
                label="Color 1"
                type="color"
                value={background?.value ?? '#4A90D9'}
                onChange={(e) =>
                  onBackgroundChange({
                    ...(background || { type: 'gradient', value: '', gradientColor2: '#357ABD', gradientDirection: 'to bottom' }),
                    value: e.target.value,
                  })
                }
                sx={{ mt: 1, '& input': { height: 40 } }}
              />
              <TextField
                fullWidth
                size="small"
                label="Color 2"
                type="color"
                value={background?.gradientColor2 ?? '#357ABD'}
                onChange={(e) =>
                  onBackgroundChange({
                    ...(background || { type: 'gradient', value: '#4A90D9', gradientDirection: 'to bottom' }),
                    gradientColor2: e.target.value,
                  })
                }
                sx={{ mt: 1, '& input': { height: 40 } }}
              />
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                <InputLabel>Direction</InputLabel>
                <Select
                  value={background?.gradientDirection ?? 'to bottom'}
                  label="Direction"
                  onChange={(e) =>
                    onBackgroundChange({
                      ...(background || { type: 'gradient', value: '#4A90D9', gradientColor2: '#357ABD' }),
                      gradientDirection: e.target.value,
                    })
                  }
                >
                  <MenuItem value="to bottom">To Bottom</MenuItem>
                  <MenuItem value="to top">To Top</MenuItem>
                  <MenuItem value="to right">To Right</MenuItem>
                  <MenuItem value="to left">To Left</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {(background?.type ?? 'solid') === 'image' && (
            <Box sx={{ mt: 1 }}>
              <input
                ref={backgroundFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleBackgroundFileChange}
              />
              <Button
                fullWidth
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
                onClick={() => backgroundFileInputRef.current?.click()}
              >
                Upload Image From Device
              </Button>
              <TextField
                fullWidth
                size="small"
                label="Image URL"
                value={background?.imageFileName ?? background?.value ?? ''}
                onChange={(e) =>
                  onBackgroundChange({
                    type: 'image',
                    value: e.target.value,
                    imageFileName: undefined,
                  })
                }
                placeholder="https://… or upload above"
                sx={{ mb: 1 }}
              />
              <Button
                fullWidth
                variant="contained"
                size="small"
                sx={{ mb: 1 }}
                onClick={onDone}
              >
                Done
              </Button>
            </Box>
          )}

          <Button
            fullWidth
            size="small"
            color="secondary"
            sx={{ mt: 2 }}
            onClick={() => onBackgroundChange(null)}
          >
            Clear Background
          </Button>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ pt: 2 }}>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={watermark?.type ?? 'text'}
              label="Type"
              onChange={(e) => {
                const t = e.target.value as WatermarkType;
                if (!watermark) {
                  onWatermarkChange({
                    type: t,
                    value: t === 'text' ? 'WATERMARK' : '',
                    opacity: 0.2,
                    position: 'center',
                  });
                } else {
                  onWatermarkChange({ ...watermark, type: t });
                }
              }}
            >
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="image">Image</MenuItem>
            </Select>
          </FormControl>

          {watermark && (
            <>
              {watermark.type === 'text' && (
                <TextField
                  fullWidth
                  size="small"
                  label="Text"
                  value={watermark.value}
                  onChange={(e) => onWatermarkChange({ ...watermark, value: e.target.value })}
                  sx={{ mb: 1 }}
                />
              )}
              {watermark.type === 'image' && (
                <Box sx={{ mb: 1 }}>
                  <input
                    ref={watermarkFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleWatermarkFileChange}
                  />
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    sx={{ mb: 1 }}
                    onClick={() => watermarkFileInputRef.current?.click()}
                  >
                    Upload Image From Device
                  </Button>
                  <TextField
                    fullWidth
                    size="small"
                    label="Image URL"
                    value={watermark.imageFileName ?? watermark.value}
                    onChange={(e) =>
                      onWatermarkChange({
                        ...watermark,
                        value: e.target.value,
                        imageFileName: undefined,
                      })
                    }
                    placeholder="https://… or upload above"
                    sx={{ mb: 1 }}
                  />
                </Box>
              )}

              <Typography variant="caption" display="block" gutterBottom>
                Opacity: {Math.round(watermark.opacity * 100)}%
              </Typography>
              <Slider
                value={watermark.opacity * 100}
                onChange={(_, v) => onWatermarkChange({ ...watermark, opacity: (v as number) / 100 })}
                min={0}
                max={100}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}%`}
              />

              <TextField
                fullWidth
                size="small"
                label="Rotation (degrees)"
                type="number"
                value={watermark.rotation ?? 0}
                onChange={(e) =>
                  onWatermarkChange({ ...watermark, rotation: parseInt(e.target.value, 10) || 0 })
                }
                sx={{ mt: 1 }}
                inputProps={{ min: -180, max: 180 }}
              />

              {watermark.type === 'text' && (
                <TextField
                  fullWidth
                  size="small"
                  label="Font size"
                  type="number"
                  value={watermark.fontSize ?? 14}
                  onChange={(e) =>
                    onWatermarkChange({ ...watermark, fontSize: parseInt(e.target.value, 10) || 14 })
                  }
                  sx={{ mt: 1 }}
                  inputProps={{ min: 8, max: 72 }}
                />
              )}

              <Button
                fullWidth
                variant="contained"
                size="small"
                sx={{ mt: 2 }}
                onClick={onDone}
              >
                Done
              </Button>
            </>
          )}

          <Button
            fullWidth
            size="small"
            color="secondary"
            sx={{ mt: 2 }}
            onClick={() => onWatermarkChange(null)}
          >
            Remove Watermark
          </Button>

          {!watermark && (
            <Button
              fullWidth
              size="small"
              variant="contained"
              sx={{ mt: 1 }}
              onClick={() =>
                onWatermarkChange({
                  type: 'text',
                  value: 'WATERMARK',
                  opacity: 0.2,
                  position: 'center',
                })
              }
            >
              Add Watermark
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
