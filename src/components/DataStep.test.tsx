import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataStep from './DataStep';
import { renderWithAppState } from '../testUtils';
import type { Template } from '../types';

function templateWithBindings(): Template {
  return {
    id: 't1', name: 'T', background: null, watermark: null,
    elements: [
      { id: 'e1', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'name' },
      { id: 'e2', type: 'text', x: 0, y: 0, width: 50, height: 20, binding: 'email' },
    ],
  };
}

function csvFile(content: string, name = 'data.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('DataStep', () => {
  it('shows the CSV upload UI when no CSV has been parsed yet', () => {
    renderWithAppState(<DataStep />);
    expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument();
  });

  it('uploading a CSV auto-maps columns whose header matches a template binding exactly', async () => {
    const user = userEvent.setup();
    renderWithAppState(<DataStep />, { initialState: { template: templateWithBindings() } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name,email,phone\nAlice,a@x.com,555'));

    // Auto-mapped: both bound fields have an exact-name CSV column, so Generate is enabled immediately.
    expect(await screen.findByRole('button', { name: 'Generate Cards' })).toBeEnabled();
  });

  it('generating cards dispatches records built from the mapping and advances to the Preview step', async () => {
    const user = userEvent.setup();
    const { container } = renderWithAppState(<DataStep />, { initialState: { template: templateWithBindings() } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name,email\nAlice,a@x.com\nBob,b@x.com'));

    await user.click(await screen.findByRole('button', { name: 'Generate Cards' }));

    expect(await screen.findByText('Generated 2 cards')).toBeInTheDocument();
    // After generating, DataStep re-renders showing the parsed summary again (csvData persists).
    expect(container.textContent).toContain('2 columns, 2 rows');
  });

  it('shows an error snackbar and does not generate when the CSV has no data rows', async () => {
    const user = userEvent.setup();
    renderWithAppState(<DataStep />, { initialState: { template: templateWithBindings() } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name,email\n'));

    // Header-only CSV still auto-maps both bindings by exact column name, so
    // Generate Cards is enabled — clicking it hits the empty-rows guard.
    await user.click(await screen.findByRole('button', { name: 'Generate Cards' }));
    expect(await screen.findByText('The CSV file has no data rows.')).toBeInTheDocument();
  });

  it('"Upload Different File" clears csvData (via SET_RECORDS([])) and returns to the upload UI', async () => {
    const user = userEvent.setup();
    renderWithAppState(<DataStep />, { initialState: { template: templateWithBindings() } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name,email\nAlice,a@x.com'));
    await screen.findByRole('button', { name: 'Upload Different File' });

    await user.click(screen.getByRole('button', { name: 'Upload Different File' }));

    // SET_RECORDS([]) clears csvData as a side effect (appState.ts), so DataStep
    // falls all the way back to the CsvUpload view, not just an empty mapping.
    expect(await screen.findByRole('button', { name: 'Upload CSV' })).toBeInTheDocument();
  });

  it('shows an error snackbar for a non-CSV file', async () => {
    renderWithAppState(<DataStep />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload CSV' })).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByText('Please select a CSV file.')).toBeInTheDocument();
  });
});
