import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PrintView from './PrintView';
import type { Template, CardRecord } from '../types';

function template(): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null };
}

function records(n: number): CardRecord[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, data: {}, overrides: {} }));
}

describe('PrintView', () => {
  it('renders exactly one page when all cards fit on one page', () => {
    const { container } = render(
      <PrintView
        template={template()}
        records={records(4)}
        indices={[0, 1, 2, 3]}
        cardWidthMm={50}
        cardHeightMm={50}
        paperWidthMm={210}
        paperHeightMm={297}
        pageMarginMm={5}
      />,
    );
    const printRoot = container.querySelector('#print-view-content')!;
    expect(printRoot.children).toHaveLength(1);
  });

  it('splits cards across multiple pages once perPage is exceeded', () => {
    // 50x50 cards, 5mm margin, A4 -> 4 cols x 5 rows = 20 per page.
    const { container } = render(
      <PrintView
        template={template()}
        records={records(25)}
        indices={Array.from({ length: 25 }, (_, i) => i)}
        cardWidthMm={50}
        cardHeightMm={50}
        paperWidthMm={210}
        paperHeightMm={297}
        pageMarginMm={5}
      />,
    );
    const printRoot = container.querySelector('#print-view-content')!;
    expect(printRoot.children).toHaveLength(2);
  });

  it('renders a single empty page when indices is empty', () => {
    const { container } = render(
      <PrintView
        template={template()}
        records={[]}
        indices={[]}
        cardWidthMm={50}
        cardHeightMm={50}
        paperWidthMm={210}
        paperHeightMm={297}
        pageMarginMm={5}
      />,
    );
    const printRoot = container.querySelector('#print-view-content')!;
    expect(printRoot.children).toHaveLength(1);
    expect(printRoot.children[0].children).toHaveLength(0);
  });

  it('skips indices that have no matching record instead of crashing', () => {
    const { container } = render(
      <PrintView
        template={template()}
        records={records(2)}
        indices={[0, 1, 99]}
        cardWidthMm={50}
        cardHeightMm={50}
        paperWidthMm={210}
        paperHeightMm={297}
        pageMarginMm={5}
      />,
    );
    const printRoot = container.querySelector('#print-view-content')!;
    expect(printRoot.children[0].children).toHaveLength(2);
  });
});
