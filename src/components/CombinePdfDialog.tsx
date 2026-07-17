import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import { getWorkspaceList, getEffectiveWorkspaceData } from '../utils/workspaceStorage';
import { resolveWorkspaceAssets } from '../utils/assetStore';
import { touchTarget44 } from '../utils/a11y';
import { renderCardsToImages, exportCardImagesToZip, type ExportFormat } from '../utils/exportImages';
import { importCardsFromFiles } from '../utils/importImages';
import { aggregateCardsToPdf, type CardImage } from '../utils/aggregatePdf';

type PaperConfig = {
  paperWidthMm: number;
  paperHeightMm: number;
  paperOrientation: 'portrait' | 'landscape' | 'auto';
  pageMarginMm: number;
  cardGapMm: number;
};

interface CombinePdfDialogProps {
  open: boolean;
  onClose: () => void;
  /** Default paper settings (from the active workspace's print settings). */
  defaultPaper: PaperConfig;
}

const PAPER_SIZES = [
  { id: 'a4',     label: 'A4 (210 × 297 mm)',     width: 210, height: 297 },
  { id: 'a3',     label: 'A3 (297 × 420 mm)',     width: 297, height: 420 },
  { id: 'letter', label: 'Letter (216 × 279 mm)', width: 216, height: 279 },
  { id: 'legal',  label: 'Legal (216 × 356 mm)',  width: 216, height: 356 },
  { id: 'custom', label: 'Custom',                width: 0,   height: 0   },
] as const;

function detectPaperId(w: number, h: number): string {
  const lo = Math.min(w, h);
  const hi = Math.max(w, h);
  const match = PAPER_SIZES.find((p) => p.id !== 'custom' && p.width === lo && p.height === hi);
  return match ? match.id : 'custom';
}

export default function CombinePdfDialog({ open, onClose, defaultPaper }: CombinePdfDialogProps) {
  const [tab, setTab] = useState<'workspaces' | 'images'>('workspaces');

  // Output mode: a combined PDF, or a ZIP of individual images.
  const [outputFormat, setOutputFormat] = useState<'pdf' | 'images'>('pdf');
  const [imageFormat, setImageFormat] = useState<ExportFormat>('png');

  // Paper config (shared by both tabs).
  const [paperId, setPaperId] = useState(() =>
    detectPaperId(defaultPaper.paperWidthMm, defaultPaper.paperHeightMm),
  );
  const [customWidth, setCustomWidth] = useState(defaultPaper.paperWidthMm);
  const [customHeight, setCustomHeight] = useState(defaultPaper.paperHeightMm);
  const [margin, setMargin] = useState(defaultPaper.pageMarginMm);
  const [gap, setGap] = useState(defaultPaper.cardGapMm);

  // Workspaces tab.
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Images tab.
  const [importedSized, setImportedSized] = useState<CardImage[]>([]);
  const [importedUnsized, setImportedUnsized] = useState<{ dataUrl: string }[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [unsizedW, setUnsizedW] = useState(85.6);
  const [unsizedH, setUnsizedH] = useState(53.98);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset transient state when (re)opening.
    void getWorkspaceList().then((list) => {
      setWorkspaces(list.workspaces.map((w) => ({ id: w.id, name: w.name })));
    });
    setSelectedIds(new Set());
    setImportedSized([]);
    setImportedUnsized([]);
    setImportWarnings([]);
    setError(null);
    setProgress(null);
    setPaperId(detectPaperId(defaultPaper.paperWidthMm, defaultPaper.paperHeightMm));
    setCustomWidth(defaultPaper.paperWidthMm);
    setCustomHeight(defaultPaper.paperHeightMm);
    setMargin(defaultPaper.pageMarginMm);
    setGap(defaultPaper.cardGapMm);
  }, [open, defaultPaper]);

  const paperConfig = (): PaperConfig => {
    if (paperId === 'custom') {
      return {
        paperWidthMm: customWidth,
        paperHeightMm: customHeight,
        paperOrientation: 'auto',
        pageMarginMm: margin,
        cardGapMm: gap,
      };
    }
    const p = PAPER_SIZES.find((x) => x.id === paperId) ?? PAPER_SIZES[0];
    return {
      paperWidthMm: p.width,
      paperHeightMm: p.height,
      paperOrientation: 'auto',
      pageMarginMm: margin,
      cardGapMm: gap,
    };
  };

  const toggleWorkspace = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const result = await importCardsFromFiles(Array.from(files));
      setImportedSized((prev) => [...prev, ...result.sized]);
      setImportedUnsized((prev) => [...prev, ...result.unsized]);
      setImportWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const generateFromWorkspaces = async () => {
    const cards: CardImage[] = [];
    // First pass: total card count for progress.
    const plans = (await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        const raw = await getEffectiveWorkspaceData(id);
        if (!raw || raw.records.length === 0) return null;
        // Stored data may hold asset: refs — resolve before rendering cards.
        const data = await resolveWorkspaceAssets(raw);
        const ps = data.printSettings;
        const cw = ps.orientation === 'portrait' ? ps.heightMm : ps.widthMm;
        const ch = ps.orientation === 'portrait' ? ps.widthMm : ps.heightMm;
        const indices =
          data.selectedCardIndices.length > 0
            ? data.selectedCardIndices
            : data.records.map((_, i) => i);
        return { data, cw, ch, indices };
      }),
    )).filter((p): p is NonNullable<typeof p> => p !== null);

    const total = plans.reduce((sum, p) => sum + p.indices.length, 0);
    if (total === 0) throw new Error('Selected workspaces have no cards to combine.');

    let done = 0;
    setProgress({ done, total });
    for (const plan of plans) {
      const { cards: rendered } = await renderCardsToImages(
        plan.data.template, plan.data.records, plan.indices, plan.cw, plan.ch,
        {
          // For the PDF output, JPEG keeps the combined file an order of
          // magnitude smaller than PNG with no meaningful quality loss on a
          // white background. For the images-ZIP output, honor whatever
          // format the user picked instead.
          format: outputFormat === 'images' ? imageFormat : 'jpeg',
          onProgress: (d) => setProgress({ done: done + d, total }),
        },
      );
      for (const r of rendered) {
        cards.push({ dataUrl: r.dataUrl, widthMm: plan.cw, heightMm: plan.ch });
      }
      done += plan.indices.length;
    }
    return cards;
  };

  // Imported images already carry their original encoding — the imageFormat
  // toggle above only controls fresh renders on the "From workspaces" tab,
  // it does not re-encode already-imported files.
  const generateFromImages = (): CardImage[] => {
    const sized = [...importedSized];
    for (const u of importedUnsized) {
      sized.push({ dataUrl: u.dataUrl, widthMm: unsizedW, heightMm: unsizedH });
    }
    if (sized.length === 0) throw new Error('No images imported yet.');
    return sized;
  };

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const cards =
        tab === 'workspaces' ? await generateFromWorkspaces() : generateFromImages();
      setProgress({ done: 0, total: cards.length });
      if (outputFormat === 'images') {
        await exportCardImagesToZip(cards, imageFormat, 'combined-cards', (done, total) =>
          setProgress({ done, total }),
        );
      } else {
        await aggregateCardsToPdf(cards, {
          ...paperConfig(),
          fileName: 'combined-cards',
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const totalImages = importedSized.length + importedUnsized.length;
  const hasValidPaperSize =
    outputFormat === 'images' || paperId !== 'custom' || (customWidth > 0 && customHeight > 0);
  const canGenerate =
    !busy &&
    hasValidPaperSize &&
    (tab === 'workspaces' ? selectedIds.size > 0 : totalImages > 0);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Combine / Export Cards</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {outputFormat === 'pdf'
            ? 'Cards are packed densely across all sources, so partially-filled last pages don’t waste paper. Cards of different sizes are grouped automatically.'
            : 'Each card is exported as a separate image file inside a ZIP archive.'}
        </Typography>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={outputFormat}
          onChange={(_, v) => { if (v) setOutputFormat(v as 'pdf' | 'images'); }}
          disabled={busy}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="pdf">Combined PDF</ToggleButton>
          <ToggleButton value="images">Images (ZIP)</ToggleButton>
        </ToggleButtonGroup>

        {outputFormat === 'images' && (
          <Box sx={{ mb: 2 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={imageFormat}
              onChange={(_, v) => { if (v) setImageFormat(v as ExportFormat); }}
              disabled={busy}
            >
              <ToggleButton value="png">PNG</ToggleButton>
              <ToggleButton value="jpeg">JPG</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="workspaces" label="From workspaces" />
          <Tab value="images" label="From exported images" />
        </Tabs>

        {tab === 'workspaces' && (
          <Box>
            {workspaces.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No workspaces found.</Typography>
            ) : (
              <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto' }}>
                {workspaces.map((w) => (
                  <ListItem key={w.id} disableGutters>
                    <FormControlLabel
                      control={
                        <Checkbox
                          sx={touchTarget44}
                          checked={selectedIds.has(w.id)}
                          onChange={() => toggleWorkspace(w.id)}
                          disabled={busy}
                        />
                      }
                      label={w.name}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}

        {tab === 'images' && (
          <Box>
            <Button variant="outlined" component="label" disabled={busy}>
              Add ZIPs or images
              <input
                hidden
                type="file"
                multiple
                accept=".zip,.png,.jpg,.jpeg,image/png,image/jpeg,application/zip"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </Button>
            {totalImages > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {totalImages} image{totalImages !== 1 ? 's' : ''} imported
                {importedUnsized.length > 0 && ` · ${importedUnsized.length} need a size`}
              </Typography>
            )}
            {importWarnings.map((w, i) => (
              <Alert severity="warning" key={i} sx={{ mt: 1 }}>{w}</Alert>
            ))}
            {importedUnsized.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                <TextField
                  label="Card width (mm)"
                  type="number"
                  size="small"
                  value={unsizedW}
                  onChange={(e) => setUnsizedW(Number(e.target.value))}
                  disabled={busy}
                />
                <TextField
                  label="Card height (mm)"
                  type="number"
                  size="small"
                  value={unsizedH}
                  onChange={(e) => setUnsizedH(Number(e.target.value))}
                  disabled={busy}
                />
              </Box>
            )}
          </Box>
        )}

        {/* Paper settings — only relevant when generating a combined PDF */}
        {outputFormat === 'pdf' && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="combine-paper-label">Paper</InputLabel>
            <Select
              labelId="combine-paper-label"
              label="Paper"
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
              disabled={busy}
            >
              {PAPER_SIZES.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {paperId === 'custom' && (
            <>
              <TextField
                label="Paper width (mm)"
                type="number"
                size="small"
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value))}
                disabled={busy}
                error={!(customWidth > 0)}
                sx={{ width: 140 }}
              />
              <TextField
                label="Paper height (mm)"
                type="number"
                size="small"
                value={customHeight}
                onChange={(e) => setCustomHeight(Number(e.target.value))}
                disabled={busy}
                error={!(customHeight > 0)}
                sx={{ width: 140 }}
              />
            </>
          )}
          <TextField
            label="Margin (mm)"
            type="number"
            size="small"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            disabled={busy}
            sx={{ width: 120 }}
          />
          <TextField
            label="Gap (mm)"
            type="number"
            size="small"
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            disabled={busy}
            sx={{ width: 120 }}
          />
        </Box>
        )}

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {busy && progress && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {progress.done} / {progress.total}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
              sx={{ mt: 0.5, borderRadius: 1 }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate} disabled={!canGenerate}>
          {busy ? 'Generating…' : outputFormat === 'images' ? 'Export ZIP' : 'Generate PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
