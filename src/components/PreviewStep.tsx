import { useState, useMemo, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { alpha } from '@mui/material/styles';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import PreviewGrid from './PreviewGrid';
import CardEditDialog from './CardEditDialog';
import WebcamCapture from './WebcamCapture';
import ImageCropDialog from './ImageCropDialog';
import BulkPhotoModal from './BulkPhotoModal';

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96, 192];

export default function PreviewStep() {
  const { template, records, printSettings, selectedCardIndices } = useAppState();
  const dispatch = useAppDispatch();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingPhotoName, setPendingPhotoName] = useState('');
  const [bulkPhotos, setBulkPhotos] = useState<{ name: string; dataUrl: string }[] | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [photoDisplayNames, setPhotoDisplayNames] = useState<Record<number, Record<string, string>>>({});
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const bindings = useMemo(
    () => template.elements
      .filter((e) => e.binding)
      .map((e) => ({ elementId: e.id, binding: e.binding!, isImage: e.type === 'image' })),
    [template.elements]
  );

  const textBindings = useMemo(
    () => bindings.filter((b) => !b.isImage).map((b) => b.binding),
    [bindings]
  );

  // Filter records by search query across all text fields (data + overrides)
  const filteredResults = useMemo(() => {
    const all = records.map((record, globalIndex) => ({ record, globalIndex }));
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter(({ record }) =>
      textBindings.some((binding) => {
        const val = record.overrides[binding] ?? record.data[binding] ?? '';
        return (val ?? '').toLowerCase().includes(q);
      })
    );
  }, [records, debouncedQuery, textBindings]);

  const isSearchActive = filteredResults.length < records.length;

  const pageCount = Math.max(1, Math.ceil(filteredResults.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  // Reset to page 1 whenever search query changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  // Debounce search query by 150ms for filteredResults computation
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredResults.slice(start, start + rowsPerPage);
  }, [filteredResults, page, rowsPerPage]);

  const { paginatedRecords, paginatedGlobalIndices } = useMemo(() => ({
    paginatedRecords: paginatedItems.map((item) => item.record),
    paginatedGlobalIndices: paginatedItems.map((item) => item.globalIndex),
  }), [paginatedItems]);

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleRowsPerPageChange = (e: { target: { value: number } }) => {
    setRowsPerPage(e.target.value);
    setPage(1);
  };

  const imageBinding =
    template.elements.find((e) => e.type === 'image' && e.binding)?.binding ?? 'photo';

  const editRecord = editIndex != null ? records[editIndex] : null;

  const handleCardClick = (index: number) => {
    setEditIndex(index);
  };

  const handleSaveOverrides = (overrides: Record<string, string | null>, fontSizeOverrides: Record<string, number | null>) => {
    if (editIndex == null) return;
    dispatch({ type: 'UPDATE_RECORD_OVERRIDES', payload: { index: editIndex, overrides, fontSizeOverrides } });
  };

  const handleTakePhotoFromDialog = () => {
    setWebcamOpen(true);
  };

  const handlePhotoReady = (dataUrl: string, name: string) => {
    setCropSrc(dataUrl);
    setPendingPhotoName(name);
  };

  const handleWebcamCapture = (dataUrl: string) => {
    setWebcamOpen(false);
    setCropSrc(dataUrl);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `Photo ${pad(now.getDate())} ${now.toLocaleString('en', { month: 'short' })} ${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setPendingPhotoName(name);
  };

  const handleCropConfirm = (croppedUrl: string) => {
    if (editIndex == null) return;
    dispatch({
      type: 'UPDATE_RECORD_OVERRIDES',
      payload: { index: editIndex, overrides: { [imageBinding]: croppedUrl } },
    });
    if (pendingPhotoName) {
      setPhotoDisplayNames((prev) => ({
        ...prev,
        [editIndex]: { ...(prev[editIndex] ?? {}), [imageBinding]: pendingPhotoName },
      }));
    }
    setPendingPhotoName('');
    setCropSrc(null);
    setEditIndex(null);
  };

  const handleCropClose = () => {
    setCropSrc(null);
  };

  const handleBulkFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;
    files.sort((a, b) => a.name.localeCompare(b.name));
    Promise.all(
      files.map(
        (file) =>
          new Promise<{ name: string; dataUrl: string } | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, dataUrl: reader.result as string });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    ).then((results) => {
      const photos = results.filter((r): r is { name: string; dataUrl: string } => r !== null);
      if (photos.length > 0) setBulkPhotos(photos);
    });
  };

  const handleBulkConfirm = (orderedPhotos: { name: string; dataUrl: string }[]) => {
    orderedPhotos.slice(0, records.length).forEach((photo, i) => {
      dispatch({
        type: 'UPDATE_RECORD_OVERRIDES',
        payload: { index: i, overrides: { [imageBinding]: photo.dataUrl } },
      });
    });
    setBulkPhotos(null);
  };

  const hasImageBinding = template.elements.some((e) => e.type === 'image' && e.binding);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {records.length === 0 ? (
        <Typography color="text.secondary">
          No cards to preview. Upload CSV in the Data step and generate cards.
        </Typography>
      ) : (
        <>
          {/* Controls row: search | actions | cards-per-page */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search cards…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ flex: '1 1 200px', maxWidth: 360 }}
              inputRef={searchInputRef}
              inputProps={{ 'aria-label': 'Search cards' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearchQuery('');
                        setTimeout(() => searchInputRef.current?.focus(), 0);
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />

            {hasImageBinding && (
              <>
                <Button size="small" variant="outlined" onClick={() => bulkInputRef.current?.click()}>
                  Bulk add photos
                </Button>
                <input
                  ref={bulkInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is not in standard HTMLInputElement types
                  webkitdirectory=""
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleBulkFolderChange}
                />
              </>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                if (isSearchActive) {
                  dispatch({ type: 'SET_SELECTED_CARD_INDICES', payload: filteredResults.map((r) => r.globalIndex) });
                } else {
                  dispatch({ type: 'SELECT_ALL_CARDS' });
                }
              }}
            >
              Select {isSearchActive ? 'Matching' : 'All'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => dispatch({ type: 'DESELECT_ALL_CARDS' })}
            >
              Deselect All
            </Button>
            <Typography variant="body2" color="text.secondary">
              {selectedCardIndices.length} selected
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: 3 })}
            >
              Print {selectedCardIndices.length > 0 ? 'Selected' : 'All'}
            </Button>

            <Box sx={{ flex: 1 }} />

            <FormControl size="small" sx={{ minWidth: 185 }}>
              <InputLabel>Cards per page</InputLabel>
              <Select
                value={rowsPerPage}
                label="Cards per page"
                onChange={handleRowsPerPageChange}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
                {filteredResults.length > Math.max(...PAGE_SIZE_OPTIONS) && (
                  <MenuItem value={filteredResults.length}>All ({filteredResults.length})</MenuItem>
                )}
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              Page {page} of {pageCount} ({filteredResults.length} {isSearchActive ? 'matching' : 'total'})
            </Typography>
          </Box>

          {/* Search results banner */}
          {isSearchActive && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1.5,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor: filteredResults.length > 0
                  ? (theme) => alpha(theme.palette.primary.main, 0.08)
                  : (theme) => alpha(theme.palette.warning.main, 0.1),
                border: '1px solid',
                borderColor: filteredResults.length > 0 ? 'primary.main' : 'warning.main',
              }}
            >
              <SearchIcon fontSize="small" sx={{ color: filteredResults.length > 0 ? 'primary.main' : 'warning.main' }} />
              <Typography variant="body2" sx={{ flex: 1, color: filteredResults.length > 0 ? 'primary.dark' : 'warning.dark' }}>
                {filteredResults.length === 0
                  ? `No cards match "${debouncedQuery}" — try a different search or clear to see all cards`
                  : `Showing ${filteredResults.length} of ${records.length} card${records.length !== 1 ? 's' : ''} matching "${debouncedQuery}"`}
              </Typography>
              <Button
                size="small"
                sx={{ whiteSpace: 'nowrap', minWidth: 0 }}
                onClick={() => {
                  setSearchQuery('');
                  setTimeout(() => searchInputRef.current?.focus(), 0);
                }}
              >
                Clear
              </Button>
            </Box>
          )}

          <PreviewGrid
            template={template}
            records={paginatedRecords}
            recordGlobalIndices={paginatedGlobalIndices}
            printSettings={printSettings}
            selectedIndices={selectedCardIndices}
            onToggleSelect={(i) => dispatch({ type: 'TOGGLE_CARD_SELECTION', payload: i })}
            onCardClick={handleCardClick}
          />

          {pageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={pageCount}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      <CardEditDialog
        open={editIndex != null}
        onClose={() => setEditIndex(null)}
        record={editRecord}
        bindings={bindings}
        onSave={handleSaveOverrides}
        onTakePhoto={handleTakePhotoFromDialog}
        onPhotoReady={handlePhotoReady}
        photoDisplayNames={editIndex != null ? (photoDisplayNames[editIndex] ?? {}) : {}}
        template={template}
        printSettings={printSettings}
      />

      <WebcamCapture
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        onCapture={handleWebcamCapture}
      />

      <ImageCropDialog
        open={cropSrc != null}
        imageSrc={cropSrc}
        onClose={handleCropClose}
        onCrop={handleCropConfirm}
      />

      {bulkPhotos != null && (
        <BulkPhotoModal
          photos={bulkPhotos}
          recordCount={records.length}
          onConfirm={handleBulkConfirm}
          onClose={() => setBulkPhotos(null)}
        />
      )}
    </Box>
  );
}
