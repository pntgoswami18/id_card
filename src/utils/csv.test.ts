import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';

function csvFile(content: string, name = 'data.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseCsv', () => {
  it('parses headers and rows from a well-formed CSV', async () => {
    const result = await parseCsv(csvFile('name,email\nAlice,alice@example.com\nBob,bob@example.com'));
    expect(result.headers).toEqual(['name', 'email']);
    expect(result.rows).toEqual([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
    ]);
  });

  it('skips empty lines', async () => {
    const result = await parseCsv(csvFile('name,email\nAlice,alice@example.com\n\nBob,bob@example.com\n'));
    expect(result.rows).toHaveLength(2);
  });

  it('resolves using meta.fields for headers even with no data rows', async () => {
    const result = await parseCsv(csvFile('name,email\n'));
    expect(result.headers).toEqual(['name', 'email']);
    expect(result.rows).toEqual([]);
  });

  it('does not reject on FieldMismatch (ragged rows) — non-fatal by design', async () => {
    // Row 2 has an extra field compared to the header row.
    const result = await parseCsv(csvFile('name,email\nAlice,alice@example.com,extra'));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Alice');
  });
});
