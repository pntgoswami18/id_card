import Box from '@mui/material/Box';
import CardCanvas from './CardCanvas';
import { computeLayout } from './PrintSettings';
import type { Template, CardRecord } from '../types';

interface PrintViewProps {
  template: Template;
  records: CardRecord[];
  indices: number[];
  /** Oriented card dimensions in mm. */
  cardWidthMm: number;
  cardHeightMm: number;
  paperWidthMm: number;
  paperHeightMm: number;
  pageMarginMm: number;
  cardGapMm?: number;
}

export default function PrintView({
  template,
  records,
  indices,
  cardWidthMm,
  cardHeightMm,
  paperWidthMm,
  paperHeightMm,
  pageMarginMm,
  cardGapMm = 0,
}: PrintViewProps) {
  const cardsToPrint = indices.filter((i) => records[i]).map((i) => records[i]);

  const { cols, rows, perPage } = computeLayout(
    paperWidthMm,
    paperHeightMm,
    cardWidthMm,
    cardHeightMm,
    pageMarginMm,
    cardGapMm,
  );

  // Split into pages
  const pages: CardRecord[][] = [];
  for (let i = 0; i < cardsToPrint.length; i += perPage) {
    pages.push(cardsToPrint.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push([]);

  return (
    <Box id="print-view-content">
      {pages.map((pageCards, pageIdx) => (
        <Box
          key={pageIdx}
          sx={{
            width: `${paperWidthMm}mm`,
            height: `${paperHeightMm}mm`,
            padding: `${pageMarginMm}mm`,
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cardWidthMm}mm)`,
            gridTemplateRows: `repeat(${rows}, ${cardHeightMm}mm)`,
            gap: `${cardGapMm}mm`,
            alignContent: 'start',
            justifyContent: 'start',
            breakAfter: 'page',
            pageBreakAfter: 'always',
          }}
        >
          {pageCards.map((record) => (
            <Box
              key={record.id}
              sx={{ width: `${cardWidthMm}mm`, height: `${cardHeightMm}mm` }}
            >
              <CardCanvas
                template={template}
                record={record}
                widthMm={cardWidthMm}
                heightMm={cardHeightMm}
                designMode={false}
              />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
