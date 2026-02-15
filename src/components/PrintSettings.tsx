import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { loadPrintPresets, savePrintPreset, deletePrintPreset } from '../utils/printPresets';
import type { PrintPreset, PrintSettings as PrintSettingsType } from '../types';

interface PrintSettingsProps {
  settings: PrintSettingsType;
  presets: PrintPreset[];
  onSettingsChange: (s: Partial<PrintSettingsType>) => void;
  onPresetsChange: (presets: PrintPreset[]) => void;
  /** When false, orientation selector is hidden (e.g. on Print step; orientation is set on Design step). */
  showOrientation?: boolean;
}

export default function PrintSettingsComponent({
  settings,
  presets,
  onSettingsChange,
  onPresetsChange,
  showOrientation = true,
}: PrintSettingsProps) {
  useEffect(() => {
    onPresetsChange(loadPrintPresets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSavePreset = () => {
    const name = prompt('Preset name');
    if (!name?.trim()) return;
    const id = `preset-${Date.now()}`;
    const preset: PrintPreset = {
      id,
      name: name.trim(),
      widthMm: settings.widthMm,
      heightMm: settings.heightMm,
      orientation: settings.orientation,
    };
    savePrintPreset(preset);
    onPresetsChange(loadPrintPresets());
  };

  const handleUsePreset = (p: PrintPreset) => {
    onSettingsChange({
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      orientation: p.orientation,
    });
  };

  const handleDeletePreset = (id: string) => {
    deletePrintPreset(id);
    onPresetsChange(loadPrintPresets());
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2">Size (mm)</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          label="Width"
          type="number"
          value={settings.widthMm}
          onChange={(e) => onSettingsChange({ widthMm: parseFloat(e.target.value) || 85.6 })}
          inputProps={{ min: 10, max: 500, step: 0.1 }}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          label="Height"
          type="number"
          value={settings.heightMm}
          onChange={(e) => onSettingsChange({ heightMm: parseFloat(e.target.value) || 53.98 })}
          inputProps={{ min: 10, max: 500, step: 0.1 }}
          sx={{ flex: 1 }}
        />
      </Box>
      {showOrientation && (
        <FormControl fullWidth size="small">
          <InputLabel>Orientation</InputLabel>
          <Select
            value={settings.orientation}
            label="Orientation"
            onChange={(e) =>
              onSettingsChange({ orientation: e.target.value as 'portrait' | 'landscape' })
            }
          >
            <MenuItem value="portrait">Portrait</MenuItem>
            <MenuItem value="landscape">Landscape</MenuItem>
          </Select>
        </FormControl>
      )}
      <Box>
        <Typography variant="caption" color="text.secondary">
          Presets
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {presets.map((p) => (
            <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button size="small" onClick={() => handleUsePreset(p)}>
                {p.name}
              </Button>
              <Button size="small" color="error" onClick={() => handleDeletePreset(p.id)}>
                ×
              </Button>
            </Box>
          ))}
        </Box>
        <Button size="small" sx={{ mt: 0.5 }} onClick={handleSavePreset}>
          Save Current As Preset
        </Button>
      </Box>
    </Box>
  );
}
