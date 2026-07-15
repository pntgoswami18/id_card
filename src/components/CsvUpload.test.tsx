import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CsvUpload from './CsvUpload';

/** Fires the input's change event directly, bypassing userEvent's `accept`-attribute
 * filtering — real browsers let users pick any file via "All files", so CsvUpload's
 * own JS-level type check (not the accept attribute) is what's under test here. */
function selectFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function csvFile(content: string, name = 'data.csv', type = 'text/csv'): File {
  return new File([content], name, { type });
}

describe('CsvUpload', () => {
  it('renders no expected-columns chips when none are given', () => {
    render(<CsvUpload onParsed={vi.fn()} />);
    expect(screen.queryByText(/Expected columns/)).not.toBeInTheDocument();
  });

  it('renders one chip per unique expected column, in order', () => {
    render(<CsvUpload onParsed={vi.fn()} expectedColumns={['name', 'photo', 'name']} />);
    const chips = screen.getAllByText(/^(name|photo)$/);
    expect(chips.map((c) => c.textContent)).toEqual(['name', 'photo']);
  });

  it('parses a selected CSV file and calls onParsed', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<CsvUpload onParsed={onParsed} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name,email\nAlice,a@x.com'));

    await waitFor(() => expect(onParsed).toHaveBeenCalledWith({
      headers: ['name', 'email'],
      rows: [{ name: 'Alice', email: 'a@x.com' }],
    }));
  });

  it('rejects a non-CSV file without parsing', () => {
    const onParsed = vi.fn();
    const onError = vi.fn();
    render(<CsvUpload onParsed={onParsed} onError={onError} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    selectFile(input, new File(['not csv'], 'data.txt', { type: 'text/plain' }));

    expect(onError).toHaveBeenCalledWith(new Error('Please select a CSV file.'));
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('accepts a .csv-named file even with a generic/blank mime type', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<CsvUpload onParsed={onParsed} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('a,b\n1,2', 'data.csv', ''));

    await waitFor(() => expect(onParsed).toHaveBeenCalled());
  });

  it('rejects a file over 50MB without parsing', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    const onError = vi.fn();
    render(<CsvUpload onParsed={onParsed} onError={onError} />);

    const big = csvFile('a,b\n1,2');
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, big);

    expect(onError).toHaveBeenCalledWith(new Error('CSV file must be under 50 MB.'));
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('calls onError with the parse failure when the CSV has fatal errors', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(<CsvUpload onParsed={vi.fn()} onError={onError} />);

    // Quoted field with no closing quote is a fatal PapaParse error, not a FieldMismatch.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, csvFile('name\n"unterminated'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('does nothing when the file picker is cancelled (no file selected)', async () => {
    const onParsed = vi.fn();
    const onError = vi.fn();
    render(<CsvUpload onParsed={onParsed} onError={onError} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Simulate the native "change" event firing with an empty FileList (cancel).
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onParsed).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
