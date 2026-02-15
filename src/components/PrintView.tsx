import Box from '@mui/material/Box';
import CardCanvas from './CardCanvas';
import type { Template, CardRecord } from '../types';

interface PrintViewProps {
  template: Template;
  records: CardRecord[];
  indices: number[];
  widthMm: number;
  heightMm: number;
}

export default function PrintView({
  template,
  records,
  indices,
  widthMm,
  heightMm,
}: PrintViewProps) {
  const cardsToPrint = indices
    .filter((i) => records[i])
    .map((i) => records[i]);

  return (
    <Box
      id="print-view-content"
      sx={{
        '& > div': {
          breakAfter: 'page',
          pageBreakAfter: 'always',
        },
      }}
    >
      {cardsToPrint.map((record) => (
        <Box
          key={record.id}
          sx={{
            width: `${widthMm}mm`,
            height: `${heightMm}mm`,
          }}
        >
          <CardCanvas
            template={template}
            record={record}
            widthMm={widthMm}
            heightMm={heightMm}
            designMode={false}
          />
        </Box>
      ))}
    </Box>
  );
}
