import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewGrid from './PreviewGrid';
import type { Template, CardRecord } from '../types';

function template(): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null };
}

function records(n: number): CardRecord[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, data: {}, overrides: {} }));
}

const printSettings = { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' as const };

describe('PreviewGrid', () => {
  it('renders nothing when there are no records', () => {
    const { container } = render(
      <PreviewGrid
        template={template()}
        records={[]}
        printSettings={printSettings}
        selectedIndices={[]}
        onToggleSelect={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one checkbox per record', () => {
    render(
      <PreviewGrid
        template={template()}
        records={records(3)}
        printSettings={printSettings}
        selectedIndices={[]}
        onToggleSelect={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('marks checkboxes checked according to selectedIndices', () => {
    render(
      <PreviewGrid
        template={template()}
        records={records(3)}
        printSettings={printSettings}
        selectedIndices={[1]}
        onToggleSelect={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.map((c) => (c as HTMLInputElement).checked)).toEqual([false, true, false]);
  });

  it('clicking a checkbox calls onToggleSelect but not onCardClick', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onCardClick = vi.fn();
    render(
      <PreviewGrid
        template={template()}
        records={records(2)}
        printSettings={printSettings}
        selectedIndices={[]}
        onToggleSelect={onToggleSelect}
        onCardClick={onCardClick}
      />,
    );
    await user.click(screen.getAllByRole('checkbox')[1]);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('clicking the card body (not the checkbox) calls onCardClick', async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    render(
      <PreviewGrid
        template={template()}
        records={records(2)}
        printSettings={printSettings}
        selectedIndices={[]}
        onToggleSelect={vi.fn()}
        onCardClick={onCardClick}
      />,
    );
    // The card's outer Box wraps the checkbox and the canvas preview.
    const cardBox = screen.getAllByRole('checkbox')[1].closest('[class*="MuiBox-root"]')!.parentElement!;
    await user.click(cardBox);
    expect(onCardClick).toHaveBeenCalledWith(1);
  });

  it('maps selection/click indices through recordGlobalIndices when a filtered subset is shown', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <PreviewGrid
        template={template()}
        records={records(2)}
        printSettings={printSettings}
        selectedIndices={[]}
        onToggleSelect={onToggleSelect}
        onCardClick={vi.fn()}
        recordGlobalIndices={[7, 12]}
      />,
    );
    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggleSelect).toHaveBeenCalledWith(7);
  });
});
