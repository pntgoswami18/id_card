import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import CardCanvas from './CardCanvas';
import type { CardRecord, Template } from '../types';

const CARD_PREVIEW_WIDTH_PX = 200;
const PX_PER_MM = 3.7795;

interface PreviewGridProps {
  template: Template;
  records: CardRecord[];
  printSettings: { widthMm: number; heightMm: number; orientation: 'portrait' | 'landscape' };
  selectedIndices: number[];
  onToggleSelect: (index: number) => void;
  onCardClick: (index: number) => void;
  /** Global index of first record in this page (for pagination) */
  recordsOffset?: number;
}

export default function PreviewGrid({
  template,
  records,
  printSettings,
  selectedIndices,
  onToggleSelect,
  onCardClick,
  recordsOffset = 0,
}: PreviewGridProps) {
  const wMm = printSettings.orientation === 'portrait' ? printSettings.heightMm : printSettings.widthMm;
  const hMm = printSettings.orientation === 'portrait' ? printSettings.widthMm : printSettings.heightMm;

  const canvasWidthPx = wMm * PX_PER_MM;
  const canvasHeightPx = hMm * PX_PER_MM;
  const scale = CARD_PREVIEW_WIDTH_PX / canvasWidthPx;
  const previewHeightPx = canvasHeightPx * scale;

  if (records.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 2,
      }}
    >
      {records.map((record, i) => {
        const globalIndex = recordsOffset + i;
        return (
        <Card
          key={record.id}
          sx={{
            cursor: 'pointer',
            border: selectedIndices.includes(globalIndex) ? '2px solid' : '1px solid',
            borderColor: selectedIndices.includes(globalIndex) ? 'primary.main' : 'divider',
          }}
          onClick={() => onCardClick(globalIndex)}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Checkbox
                size="small"
                checked={selectedIndices.includes(globalIndex)}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(globalIndex);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: previewHeightPx,
                  overflow: 'hidden',
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    width: CARD_PREVIEW_WIDTH_PX,
                    height: previewHeightPx,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: 'hidden',
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
                      record={record}
                      widthMm={wMm}
                      heightMm={hMm}
                      designMode={false}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      );})}
    </Box>
  );
}
