import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintStep from './PrintStep';
import { renderWithAppState } from '../testUtils';
import type { CardRecord, Template } from '../types';

vi.mock('../utils/exportImages', () => ({
  exportCardsAsImages: vi.fn().mockResolvedValue(undefined),
}));

function template(): Template {
  return { id: 't1', name: 'T', elements: [], background: null, watermark: null };
}

function records(n: number): CardRecord[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, data: {}, overrides: {} }));
}

const printSettings = { widthMm: 85.6, heightMm: 53.98, orientation: 'landscape' as const };

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('PrintStep — empty state', () => {
  it('shows a fallback message and disables Print/Export when there are no records', async () => {
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: [] } });
    expect(await screen.findByText('No cards to print. Generate cards in the Data step first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print All' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export All' })).toBeDisabled();
  });
});

describe('PrintStep — print', () => {
  it('shows "Print All" and card/sheet summary when nothing is selected', async () => {
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(3), printSettings } });
    expect(await screen.findByRole('button', { name: 'Print All' })).toBeEnabled();
    expect(screen.getByText(/sheets? total/)).toBeInTheDocument();
  });

  it('shows "Print Selected (N)" when cards are selected', async () => {
    renderWithAppState(<PrintStep />, {
      initialState: { template: template(), records: records(5), printSettings, selectedCardIndices: [0, 2] },
    });
    expect(await screen.findByRole('button', { name: 'Print Selected (2)' })).toBeInTheDocument();
  });

  it('clicking Print calls window.print()', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(3), printSettings } });
    await user.click(await screen.findByRole('button', { name: 'Print All' }));
    expect(printSpy).toHaveBeenCalled();
  });
});

describe('PrintStep — export', () => {
  it('defaults to PNG export format', async () => {
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(2), printSettings } });
    expect(await screen.findByRole('button', { name: 'PNG' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switching to JPG updates the toggle state', async () => {
    const user = userEvent.setup();
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(2), printSettings } });
    await user.click(await screen.findByRole('button', { name: 'JPG' }));
    expect(screen.getByRole('button', { name: 'JPG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'PNG' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking Export All calls exportCardsAsImages with the selected format and all record indices', async () => {
    const user = userEvent.setup();
    const { exportCardsAsImages } = await import('../utils/exportImages');
    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(3), printSettings } });
    await user.click(await screen.findByRole('button', { name: 'Export All' }));

    await waitFor(() => expect(exportCardsAsImages).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      expect.any(Array),
      [0, 1, 2],
      expect.any(Number),
      expect.any(Number),
      'cards',
      expect.objectContaining({ format: 'png' }),
    ));
  });

  it('exports only the selected indices when a selection is active', async () => {
    const user = userEvent.setup();
    const { exportCardsAsImages } = await import('../utils/exportImages');
    renderWithAppState(<PrintStep />, {
      initialState: { template: template(), records: records(5), printSettings, selectedCardIndices: [1, 3] },
    });
    await user.click(await screen.findByRole('button', { name: 'Export Selected (2)' }));
    await waitFor(() => expect(exportCardsAsImages).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), [1, 3], expect.anything(), expect.anything(), expect.anything(), expect.anything(),
    ));
  });

  it('uses the current workspace name as the export file base name', async () => {
    const user = userEvent.setup();
    const { exportCardsAsImages } = await import('../utils/exportImages');
    renderWithAppState(<PrintStep />, {
      initialState: {
        template: template(), records: records(1), printSettings,
        currentWorkspaceId: 'w1', workspaceList: [{ id: 'w1', name: 'My Workspace' }],
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Export All' }));
    await waitFor(() => expect(vi.mocked(exportCardsAsImages).mock.calls[0][5]).toBe('My Workspace'));
  });

  it('shows export progress and disables the button while exporting', async () => {
    const user = userEvent.setup();
    const { exportCardsAsImages } = await import('../utils/exportImages');
    let resolveExport!: () => void;
    vi.mocked(exportCardsAsImages).mockImplementation((_t, _r, _i, _w, _h, _n, options) => {
      options.onProgress?.(1, 3);
      return new Promise((resolve) => { resolveExport = () => resolve(undefined); });
    });

    renderWithAppState(<PrintStep />, { initialState: { template: template(), records: records(3), printSettings } });
    await user.click(await screen.findByRole('button', { name: 'Export All' }));

    expect(await screen.findByRole('button', { name: 'Exporting… 1 / 3' })).toBeDisabled();
    resolveExport();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export All' })).toBeEnabled());
  });
});
