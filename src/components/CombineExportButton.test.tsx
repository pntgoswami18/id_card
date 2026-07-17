import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CombineExportButton from './CombineExportButton';
import { clearAllStores } from '../utils/testHelpers';
import type { PrintSettings } from '../types';

vi.mock('../utils/exportImages', () => ({
  renderCardsToImages: vi.fn(),
  exportCardImagesToZip: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/aggregatePdf', () => ({
  aggregateCardsToPdf: vi.fn().mockResolvedValue(undefined),
}));

const printSettings: PrintSettings = {
  widthMm: 85.6, heightMm: 53.98, orientation: 'landscape',
  paperWidthMm: 210, paperHeightMm: 297, paperOrientation: 'auto', pageMarginMm: 5, cardGapMm: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('CombineExportButton', () => {
  it('renders without requiring any records/template, and opens the Combine/Export dialog on click', async () => {
    await clearAllStores();
    const user = userEvent.setup();
    render(<CombineExportButton printSettings={printSettings} />);

    const button = screen.getByRole('button', { name: 'Combine / Export Cards…' });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(await screen.findByRole('heading', { name: 'Combine / Export Cards' })).toBeInTheDocument();
  });
});
