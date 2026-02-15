import { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import { useAppState, useAppDispatch } from '../store/AppStateContext';
import PreviewGrid from './PreviewGrid';
import CardEditDialog from './CardEditDialog';
import WebcamCapture from './WebcamCapture';

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96, 192];

export default function PreviewStep() {
  const { template, records, printSettings, selectedCardIndices } = useAppState();
  const dispatch = useAppDispatch();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(24);

  const pageCount = Math.max(1, Math.ceil(records.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return records.slice(start, start + rowsPerPage);
  }, [records, page, rowsPerPage]);
  const recordsOffset = (page - 1) * rowsPerPage;

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleRowsPerPageChange = (e: { target: { value: number } }) => {
    setRowsPerPage(e.target.value);
    setPage(1);
  };

  const bindings = template.elements
    .filter((e) => e.binding)
    .map((e) => ({ elementId: e.id, binding: e.binding! }));

  const editRecord = editIndex != null ? records[editIndex] : null;

  const handleCardClick = (index: number) => {
    setEditIndex(index);
  };

  const handleSaveOverrides = (overrides: Record<string, string | null>) => {
    if (editIndex == null) return;
    dispatch({ type: 'UPDATE_RECORD_OVERRIDES', payload: { index: editIndex, overrides } });
  };

  const handleTakePhotoFromDialog = () => {
    setWebcamOpen(true);
  };

  const handleWebcamCapture = (dataUrl: string) => {
    if (editIndex == null) return;
    dispatch({
      type: 'UPDATE_RECORD_OVERRIDES',
      payload: { index: editIndex, overrides: { photo: dataUrl } },
    });
    setWebcamOpen(false);
    setEditIndex(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {records.length === 0 ? (
        <Typography color="text.secondary">
          No cards to preview. Upload CSV in the Data step and generate cards.
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => dispatch({ type: 'SELECT_ALL_CARDS' })}
            >
              Select All
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => dispatch({ type: 'DESELECT_ALL_CARDS' })}
            >
              Deselect All
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              {selectedCardIndices.length} selected
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: 3 })}
            >
              Print {selectedCardIndices.length > 0 ? 'Selected' : 'All'}
            </Button>
          </Box>

          {records.length > PAGE_SIZE_OPTIONS[0] && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mb: 2,
                flexWrap: 'wrap',
              }}
            >
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Cards per page</InputLabel>
                <Select
                  value={rowsPerPage}
                  label="Cards per page"
                  onChange={handleRowsPerPageChange}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                  {records.length > Math.max(...PAGE_SIZE_OPTIONS) && (
                    <MenuItem value={records.length}>
                      All ({records.length})
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                Page {page} of {pageCount} ({records.length} total)
              </Typography>
            </Box>
          )}

          <PreviewGrid
            template={template}
            records={paginatedRecords}
            printSettings={printSettings}
            selectedIndices={selectedCardIndices}
            onToggleSelect={(i) => dispatch({ type: 'TOGGLE_CARD_SELECTION', payload: i })}
            onCardClick={handleCardClick}
            recordsOffset={recordsOffset}
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
      />

      <WebcamCapture
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        onCapture={handleWebcamCapture}
      />
    </Box>
  );
}
