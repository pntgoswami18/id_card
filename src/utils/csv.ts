import Papa from 'papaparse';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(results.errors.map((e) => e.message).join('; ')));
          return;
        }
        const rows = (results.data || []) as Record<string, string>[];
        const headers = results.meta.fields || (rows[0] ? Object.keys(rows[0]) : []);
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}
