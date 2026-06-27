import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { loadPrintPresets, savePrintPreset, deletePrintPreset } from '../utils/printPresets';
import type { PrintPreset, PrintSettings as PrintSettingsType } from '../types';

interface PrintSettingsProps {
  settings: PrintSettingsType;
  presets: PrintPreset[];
  onSettingsChange: (s: Partial<PrintSettingsType>) => void;
  onPresetsChange: (presets: PrintPreset[]) => void;
  /** When false, card orientation selector is hidden (set in Design step). */
  showOrientation?: boolean;
  /** Oriented card dimensions in mm — used to show layout summary and auto-detect paper orientation. */
  cardWidthMm?: number;
  cardHeightMm?: number;
}

const PAPER_SIZES = [
  { id: 'a4',     label: 'A4 (210 × 297 mm)',  width: 210,   height: 297   },
  { id: 'a3',     label: 'A3 (297 × 420 mm)',  width: 297,   height: 420   },
  { id: 'letter', label: 'Letter (216 × 279 mm)', width: 216, height: 279  },
  { id: 'legal',  label: 'Legal (216 × 356 mm)',  width: 216, height: 356  },
  { id: 'custom', label: 'Custom',               width: 0,    height: 0    },
] as const;

function detectPaperSizeId(w: number, h: number): string {
  const match = PAPER_SIZES.find(
    (p) => p.id !== 'custom' && p.width === w && p.height === h,
  );
  return match ? match.id : 'custom';
}

export function computeLayout(
  paperW: number,
  paperH: number,
  cardW: number,
  cardH: number,
  margin: number,
  gap = 0,
): { cols: number; rows: number; perPage: number } {
  const usableW = paperW - 2 * margin;
  const usableH = paperH - 2 * margin;
  // N cards + (N-1) gaps <= usable  →  N <= (usable + gap) / (card + gap)
  const cols = Math.max(1, Math.floor((usableW + gap) / (cardW + gap)));
  const rows = Math.max(1, Math.floor((usableH + gap) / (cardH + gap)));
  return { cols, rows, perPage: cols * rows };
}

/**
 * Returns the actual paper width × height after applying orientation.
 * The stored paperWidthMm/paperHeightMm are always in portrait order (shorter × taller).
 * 'auto' picks whichever orientation fits more cards per page.
 */
export function computeEffectivePaperDims(
  rawW: number,
  rawH: number,
  paperOrientation: 'portrait' | 'landscape' | 'auto',
  cardW: number,
  cardH: number,
  margin: number,
  gap = 0,
): { w: number; h: number; usedOrientation: 'portrait' | 'landscape' } {
  const shortSide = Math.min(rawW, rawH);
  const longSide  = Math.max(rawW, rawH);

  if (paperOrientation === 'portrait') {
    return { w: shortSide, h: longSide, usedOrientation: 'portrait' };
  }
  if (paperOrientation === 'landscape') {
    return { w: longSide, h: shortSide, usedOrientation: 'landscape' };
  }

  // auto: pick the orientation that fits more cards per page; portrait wins ties
  const portrait  = computeLayout(shortSide, longSide, cardW, cardH, margin, gap);
  const landscape = computeLayout(longSide, shortSide, cardW, cardH, margin, gap);
  if (landscape.perPage > portrait.perPage) {
    return { w: longSide, h: shortSide, usedOrientation: 'landscape' };
  }
  return { w: shortSide, h: longSide, usedOrientation: 'portrait' };
}

type MeasurementUnit = 'mm' | 'cm' | 'in';

const UNIT_LABELS: Record<MeasurementUnit, string> = { mm: 'mm', cm: 'cm', in: 'in' };

function toDisplay(mm: number, unit: MeasurementUnit): number {
  if (unit === 'cm') return Math.round((mm / 10) * 100) / 100;
  if (unit === 'in') return Math.round((mm / 25.4) * 1000) / 1000;
  return mm;
}

function toMm(val: number, unit: MeasurementUnit): number {
  if (unit === 'cm') return val * 10;
  if (unit === 'in') return val * 25.4;
  return val;
}

function unitStep(unit: MeasurementUnit): number {
  if (unit === 'cm') return 0.05;
  if (unit === 'in') return 0.02;
  return 0.5;
}

export default function PrintSettingsComponent({
  settings,
  presets,
  onSettingsChange,
  onPresetsChange,
  showOrientation = true,
  cardWidthMm,
  cardHeightMm,
}: PrintSettingsProps) {
  const [unit, setUnit] = useState<MeasurementUnit>('mm');

  useEffect(() => {
    onPresetsChange(loadPrintPresets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawPaperW = settings.paperWidthMm  ?? 210;
  const rawPaperH = settings.paperHeightMm ?? 297;
  const margin    = settings.pageMarginMm  ?? 5;
  const gap       = settings.cardGapMm     ?? 0;
  const paperOrientation = settings.paperOrientation ?? 'auto';

  const u = unit;
  const step = unitStep(u);
  const ul = UNIT_LABELS[u];

  // Local state so selecting "Custom" immediately reveals the input fields,
  // even before the user has changed the dimension values.
  const [sizeId, setSizeId] = useState(() => detectPaperSizeId(rawPaperW, rawPaperH));

  const handlePaperSizeSelect = (id: string) => {
    setSizeId(id);
    const preset = PAPER_SIZES.find((p) => p.id === id);
    if (preset && preset.id !== 'custom') {
      onSettingsChange({ paperWidthMm: preset.width, paperHeightMm: preset.height });
    }
    // For 'custom': keep the current dimensions as the starting point; user edits the fields below.
  };

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

  // Compute layout summary using effective paper dims
  const hasCardDims = cardWidthMm && cardHeightMm && cardWidthMm > 0 && cardHeightMm > 0;
  let layoutSummary: { cols: number; rows: number; perPage: number } | null = null;
  let resolvedOrientation: 'portrait' | 'landscape' | null = null;
  if (hasCardDims) {
    const eff = computeEffectivePaperDims(
      rawPaperW, rawPaperH, paperOrientation, cardWidthMm!, cardHeightMm!, margin, gap,
    );
    layoutSummary = computeLayout(eff.w, eff.h, cardWidthMm!, cardHeightMm!, margin, gap);
    resolvedOrientation = eff.usedOrientation;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── Unit selector ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>Units</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={unit}
          onChange={(_, v) => { if (v) setUnit(v); }}
        >
          <ToggleButton value="mm">mm</ToggleButton>
          <ToggleButton value="cm">cm</ToggleButton>
          <ToggleButton value="in">in</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── Paper size ── */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Paper size</Typography>
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel>Paper size</InputLabel>
          <Select
            value={sizeId}
            label="Paper size"
            onChange={(e) => handlePaperSizeSelect(e.target.value)}
          >
            {PAPER_SIZES.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {sizeId === 'custom' && (
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small" label={`Paper width (${ul})`} type="number"
              value={toDisplay(rawPaperW, u)}
              onChange={(e) => onSettingsChange({ paperWidthMm: toMm(parseFloat(e.target.value) || 0, u) || 210 })}
              inputProps={{ min: toDisplay(50, u), max: toDisplay(2000, u), step }}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small" label={`Paper height (${ul})`} type="number"
              value={toDisplay(rawPaperH, u)}
              onChange={(e) => onSettingsChange({ paperHeightMm: toMm(parseFloat(e.target.value) || 0, u) || 297 })}
              inputProps={{ min: toDisplay(50, u), max: toDisplay(2000, u), step }}
              sx={{ flex: 1 }}
            />
          </Box>
        )}
      </Box>

      {/* ── Paper orientation ── */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Paper orientation</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={paperOrientation}
          onChange={(_, v) => { if (v) onSettingsChange({ paperOrientation: v }); }}
        >
          <ToggleButton value="auto">Auto</ToggleButton>
          <ToggleButton value="portrait">Portrait</ToggleButton>
          <ToggleButton value="landscape">Landscape</ToggleButton>
        </ToggleButtonGroup>
        {paperOrientation === 'auto' && resolvedOrientation && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Auto-selected: {resolvedOrientation}
          </Typography>
        )}
      </Box>

      {/* ── Margins + layout summary ── */}
      <Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
          <TextField
            size="small" label={`Page margin (${ul})`} type="number"
            value={toDisplay(margin, u)}
            onChange={(e) => onSettingsChange({ pageMarginMm: toMm(parseFloat(e.target.value) || 0, u) })}
            inputProps={{ min: 0, max: toDisplay(50, u), step }}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small" label={`Card gap (${ul})`} type="number"
            value={toDisplay(gap, u)}
            onChange={(e) => onSettingsChange({ cardGapMm: toMm(parseFloat(e.target.value) || 0, u) })}
            inputProps={{ min: 0, max: toDisplay(50, u), step }}
            sx={{ flex: 1 }}
          />
        </Box>
        {layoutSummary && (
          <Typography variant="caption" color="text.secondary">
            {layoutSummary.cols} × {layoutSummary.rows} = {layoutSummary.perPage} card
            {layoutSummary.perPage !== 1 ? 's' : ''} per sheet
          </Typography>
        )}
      </Box>

      {/* ── Card size ── */}
      <Box>
        <Typography variant="subtitle2">Card size ({ul})</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Each card is printed at these exact dimensions.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small" label="Width" type="number"
          value={toDisplay(settings.widthMm, u)}
          onChange={(e) => onSettingsChange({ widthMm: toMm(parseFloat(e.target.value) || 0, u) || 85.6 })}
          inputProps={{ min: toDisplay(10, u), max: toDisplay(500, u), step }}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small" label="Height" type="number"
          value={toDisplay(settings.heightMm, u)}
          onChange={(e) => onSettingsChange({ heightMm: toMm(parseFloat(e.target.value) || 0, u) || 53.98 })}
          inputProps={{ min: toDisplay(10, u), max: toDisplay(500, u), step }}
          sx={{ flex: 1 }}
        />
      </Box>

      {showOrientation && (
        <FormControl fullWidth size="small">
          <InputLabel>Card orientation</InputLabel>
          <Select
            value={settings.orientation}
            label="Card orientation"
            onChange={(e) =>
              onSettingsChange({ orientation: e.target.value as 'portrait' | 'landscape' })
            }
          >
            <MenuItem value="portrait">Portrait</MenuItem>
            <MenuItem value="landscape">Landscape</MenuItem>
          </Select>
        </FormControl>
      )}

      {/* ── Presets ── */}
      <Box>
        <Typography variant="caption" color="text.secondary">Presets</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {presets.map((p) => (
            <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button size="small" onClick={() => handleUsePreset(p)}>{p.name}</Button>
              <Button size="small" color="error" onClick={() => handleDeletePreset(p.id)}>×</Button>
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
