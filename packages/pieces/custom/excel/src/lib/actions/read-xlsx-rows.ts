import { createAction, Property } from '@activepieces/pieces-framework';
import ExcelJS from 'exceljs';

type ParsedRow = Record<string, unknown>;

type ActionResult = {
  sheets: string[];
  sheet: string;
  headers: string[];
  rows: ParsedRow[];
  rowCount: number;
};

export const readXlsxRows = createAction({
  name: 'read_xlsx_rows',
  displayName: 'Read XLSX Rows',
  description:
    'Parse an .xlsx file and return its rows as JSON objects keyed by header. Output is iterable downstream via the core "Loop on Items" step.',
  errorHandlingOptions: {
    continueOnFailure: { hide: true },
    retryOnFailure: { hide: true },
  },
  props: {
    file: Property.File({
      displayName: 'File',
      description: 'XLSX file. Pass an uploaded file object from a prior step.',
      required: true,
    }),
    sheetName: Property.ShortText({
      displayName: 'Sheet Name',
      description:
        'Name of the worksheet to read. Leave blank to read the first worksheet.',
      required: false,
    }),
    headerRowIndex: Property.Number({
      displayName: 'Header Row',
      description:
        '1-based row number containing the column headers. Defaults to 1.',
      required: false,
      defaultValue: 1,
    }),
    skipEmptyRows: Property.Checkbox({
      displayName: 'Skip Empty Rows',
      description:
        'When checked, rows where every cell is blank are excluded from the output.',
      required: false,
      defaultValue: true,
    }),
  },
  async run(context): Promise<ActionResult> {
    const { file, sheetName, headerRowIndex, skipEmptyRows } =
      context.propsValue;

    const headerRow =
      typeof headerRowIndex === 'number' && headerRowIndex >= 1
        ? Math.floor(headerRowIndex)
        : 1;
    const skipBlanks = skipEmptyRows ?? true;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.data);

    const sheets = workbook.worksheets.map((s) => s.name);
    if (sheets.length === 0) {
      throw new Error('Workbook contains no worksheets.');
    }

    const targetName = sheetName?.trim() || sheets[0];
    const worksheet = workbook.getWorksheet(targetName);
    if (!worksheet) {
      throw new Error(
        `Sheet "${targetName}" not found. Available sheets: ${sheets.join(', ')}`,
      );
    }

    const headerRowObject = worksheet.getRow(headerRow);
    const headers = extractHeaders(headerRowObject);

    if (headers.length === 0) {
      throw new Error(
        `Header row ${headerRow} of sheet "${targetName}" is empty. Set "Header Row" to the row that contains your column names.`,
      );
    }

    const rows: ParsedRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const parsed = parseRow(row, headers);
      if (skipBlanks && isBlankRow(parsed)) return;
      rows.push(parsed);
    });

    return {
      sheets,
      sheet: targetName,
      headers,
      rows,
      rowCount: rows.length,
    };
  },
});

const extractHeaders = (row: ExcelJS.Row): string[] => {
  const headers: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const raw = cellToValue(cell);
    const label =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? `column_${colNumber}`
        : String(raw).trim();
    headers[colNumber - 1] = label;
  });
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === undefined) headers[i] = `column_${i + 1}`;
  }
  return headers;
};

const parseRow = (row: ExcelJS.Row, headers: string[]): ParsedRow => {
  const out: ParsedRow = {};
  headers.forEach((header, idx) => {
    const cell = row.getCell(idx + 1);
    out[header] = cellToValue(cell);
  });
  return out;
};

const cellToValue = (cell: ExcelJS.Cell): unknown => {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const obj = v as unknown as Record<string, unknown>;
    if ('text' in obj && typeof obj['text'] === 'string') return obj['text'];
    if ('result' in obj && obj['result'] !== undefined) return obj['result'];
    if ('richText' in obj && Array.isArray(obj['richText'])) {
      return (obj['richText'] as Array<{ text?: string }>)
        .map((r) => r.text ?? '')
        .join('');
    }
    if ('hyperlink' in obj || 'formula' in obj) {
      return obj['result'] ?? obj['text'] ?? null;
    }
    if ('error' in obj) return null;
  }
  return String(v);
};

const isBlankRow = (row: ParsedRow): boolean => {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === '',
  );
};
