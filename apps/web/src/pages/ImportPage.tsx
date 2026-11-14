import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AssetRow, CsvTransactionRow, Currency, TransactionType } from '@cartera/shared';
import { CURRENCIES, TRANSACTION_TYPES } from '@cartera/shared';
import { PageHeader } from '../components/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Stat,
  Textarea,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatDate, money } from '../lib/format';

type ImportStep = 'file' | 'mapping' | 'preview' | 'done';

const CSV_HEADERS = [
  { key: 'symbol', label: 'Símbolo', required: true },
  { key: 'type', label: 'Tipo (Compra/Venta)', required: true },
  { key: 'trade_date', label: 'Fecha (YYYY-MM-DD)', required: true },
  { key: 'quantity', label: 'Cantidad', required: true },
  { key: 'unit_price', label: 'Precio unitario', required: true },
  { key: 'fees', label: 'Comisiones', required: false },
  { key: 'currency', label: 'Divisa', required: false },
  { key: 'notes', label: 'Notas', required: false },
];

const TYPE_LABELS: Record<TransactionType, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
};

/** Parser CSV simple sin dependencias externas. Maneja campos entre comillas. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\r') {
        // ignorar
      } else if (char === '\n') {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      } else {
        current += char;
      }
    }
  }

  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  // Elimina la última fila si está completamente vacía (trailing newline).
  const last = rows[rows.length - 1];
  if (last && last.every((cell) => cell.trim() === '')) {
    rows.pop();
  }

  return rows;
};

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isPositiveNumber = (value: string): boolean => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const isNonNegativeNumber = (value: string): boolean => {
  if (value.trim() === '') return true;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
};

interface MappedRow {
  rowNumber: number;
  values: Record<string, string>;
  errors: Array<{ field: string; message: string }>;
}

export const ImportPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ImportStep>('file');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // columna -> clave del campo
  const [preview, setPreview] = useState<MappedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ data: AssetRow[] }>('/assets'),
  });

  const assets = assetsQuery.data?.data ?? [];
  const symbolsByAsset = useMemo(
    () => new Map(assets.map((a) => [a.symbol.toUpperCase(), a])),
    [assets],
  );

  // ------------------------------------------------------------------
  // Paso 1: archivo
  // ------------------------------------------------------------------

  const downloadTemplate = () => {
    const header = CSV_HEADERS.map((h) => h.label).join(',');
    const example1 = 'AAPL,Compra,2026-01-15,10,150,0,EUR,Compra inicial';
    const example2 = 'BTC-USD,Venta,2026-03-20,0.5,45000,10,USD,Venta parcial';
    const csv = [header, example1, example2].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-operaciones.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setMessage('Selecciona un archivo con extensión .csv.');
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setMessage('El CSV debe contener al menos una fila de encabezados y una de datos.');
        return;
      }
      setRawRows(rows);
      setHeaders(rows[0] ?? []);
      setStep('mapping');
    };
    reader.onerror = () => {
      setMessage('No se pudo leer el archivo.');
    };
    reader.readAsText(selectedFile, 'UTF-8');
  };

  // ------------------------------------------------------------------
  // Paso 2: mapeo
  // ------------------------------------------------------------------

  const autoMap = () => {
    const next: Record<string, string> = {};
    headers.forEach((header) => {
      const normalized = header.trim().toLowerCase();
      const match = CSV_HEADERS.find((h) => h.label.toLowerCase() === normalized);
      if (match) next[header] = match.key;
    });
    setMapping(next);
  };

  const requiredKeys = CSV_HEADERS.filter((h) => h.required).map((h) => h.key);
  const mappingComplete = requiredKeys.every((key) => Object.values(mapping).includes(key));

  const goToPreview = () => {
    const mapped: MappedRow[] = [];
    const assetSet = new Set(symbolsByAsset.keys());

    for (let i = 1; i < rawRows.length; i++) {
      const cells = rawRows[i];
      if (!cells) continue;
      const values: Record<string, string> = {};
      const errors: Array<{ field: string; message: string }> = [];

      headers.forEach((header, colIndex) => {
        const key = mapping[header];
        if (!key) return;
        values[key] = cells[colIndex] ?? '';
      });

      // Validaciones básicas por fila.
      if (!values.symbol || values.symbol.trim() === '') {
        errors.push({ field: 'symbol', message: 'El símbolo es obligatorio.' });
      } else if (!assetSet.has(values.symbol.trim().toUpperCase())) {
        errors.push({ field: 'symbol', message: `Activo "${values.symbol}" no encontrado en tu catálogo.` });
      }

      if (!values.type || !TRANSACTION_TYPES.includes(values.type as TransactionType)) {
        errors.push({ field: 'type', message: 'El tipo debe ser Compra o Venta.' });
      }

      if (!values.trade_date || !isIsoDate(values.trade_date)) {
        errors.push({ field: 'trade_date', message: 'Fecha inválida (usa YYYY-MM-DD).' });
      }

      if (!values.quantity || !isPositiveNumber(values.quantity)) {
        errors.push({ field: 'quantity', message: 'La cantidad debe ser un número positivo.' });
      }

      if (!values.unit_price || !isPositiveNumber(values.unit_price)) {
        errors.push({ field: 'unit_price', message: 'El precio unitario debe ser un número positivo.' });
      }

      if (values.fees !== undefined && values.fees !== '' && !isNonNegativeNumber(values.fees)) {
        errors.push({ field: 'fees', message: 'Las comisiones no pueden ser negativas.' });
      }

      if (values.currency && !CURRENCIES.includes(values.currency as Currency)) {
        errors.push({ field: 'currency', message: `Divisa "${values.currency}" no soportada.` });
      }

      mapped.push({ rowNumber: i, values, errors });
    }

    setPreview(mapped);
    setStep('preview');
  };

  // ------------------------------------------------------------------
  // Paso 4: confirmar
  // ------------------------------------------------------------------

  const submitImport = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const rows: CsvTransactionRow[] = preview.map((item) => ({
        symbol: (item.values.symbol ?? '').trim(),
        type: (item.values.type ?? 'BUY') as TransactionType,
        trade_date: item.values.trade_date ?? '',
        quantity: item.values.quantity ?? '',
        unit_price: item.values.unit_price ?? '',
        fees: item.values.fees === '' || item.values.fees === undefined ? '0' : item.values.fees,
        currency: (item.values.currency ?? 'EUR') as Currency,
        notes: item.values.notes ?? null,
      }));

      const result = await api.post<{ imported: number; skipped: number; errors: Array<{ row: number; field: string | null; message: string }> }>('/transactions/import', {
        rows,
      });

      setStep('done');
      setMessage(
        `Importación completa: ${result.imported} operación${result.imported !== 1 ? 'es' : ''} importada${result.imported !== 1 ? 's' : ''}${
          result.skipped > 0 ? `, ${result.skipped} omitida${result.skipped !== 1 ? 's' : ''}` : ''
        }.`,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
      } else {
        setMessage('No se pudo completar la importación.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const commonActions = (
    <>
      <Button variant="subtle" onClick={() => setStep('file')}>
        Cambiar archivo
      </Button>
      <Button variant="ghost" onClick={() => navigate('/operaciones')}>
        Volver a operaciones
      </Button>
    </>
  );

  if (step === 'file') {
    return (
      <div className="animate-rise space-y-5">
        <PageHeader
          title="Importar operaciones desde CSV"
          description="Sube un archivo CSV con tus compras y ventas. Las plusvalías se calcularán automáticamente."
          actions={
            <>
              <Button variant="subtle" onClick={downloadTemplate}>
                Descargar plantilla
              </Button>
            </>
          }
        />

        <Card>
          <CardHeader
            title="Seleccionar archivo"
            subtitle="Formato CSV con encabezados en la primera fila. Codificación UTF-8."
          />
          <div className="space-y-4">
            {message ? <ErrorNote>{message}</ErrorNote> : null}
            <Field label="Archivo CSV">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="block w-full text-sm text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-white hover:file:bg-accent/90"
              />
            </Field>
            {fileName && (
              <p className="text-xs text-muted">Archivo seleccionado: {fileName}</p>
            )}
            <p className="text-xs text-muted">
              Encabezados esperados:{' '}
              {CSV_HEADERS.map((h) => (h.required ? `*${h.label}` : h.label)).join(', ')}.
              Los campos marcados con * son obligatorios.
            </p>
          </div>
          <div className="flex justify-end pt-4">
            <Button
              variant="primary"
              disabled={!file}
              onClick={() => setStep('mapping')}
            >
              Continuar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'mapping') {
    return (
      <div className="animate-rise space-y-5">
        <PageHeader
          title="Mapear columnas"
          description="Asigna cada columna del CSV a un campo de la aplicación."
          actions={commonActions}
        />

        <Card>
          <CardHeader title="Asignación de columnas" />
          <div className="space-y-3">
            {headers.map((header) => (
              <Field key={header} label={header} hint="Selecciona el campo correspondiente.">
                <Select
                  value={mapping[header] ?? ''}
                  onChange={(event) =>
                    setMapping({ ...mapping, [header]: event.target.value })
                  }
                >
                  <option value="">(ignorar columna)</option>
                  {CSV_HEADERS.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}{field.required ? ' *' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {!mappingComplete && (
            <ErrorNote>
              Faltan campos obligatorios: {requiredKeys
                .filter((key) => !Object.values(mapping).includes(key))
                .map((key) => CSV_HEADERS.find((h) => h.key === key)?.label)
                .join(', ')}.
            </ErrorNote>
          )}
          <div className="flex justify-between pt-4">
            <Button variant="subtle" onClick={autoMap}>
              Asignar automáticamente
            </Button>
            <Button
              variant="primary"
              disabled={!mappingComplete}
              onClick={goToPreview}
            >
              Vista previa
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'preview') {
    const errorCount = preview.reduce((sum, r) => sum + r.errors.length, 0);
    const validCount = preview.filter((r) => r.errors.length === 0).length;

    return (
      <div className="animate-rise space-y-5">
        <PageHeader
          title="Vista previa de la importación"
          description={
            <>
              {preview.length} fila{preview.length !== 1 ? 's' : ''} detectada{preview.length !== 1 ? 's' : ''} ·{' '}
              {validCount} válida{validCount !== 1 ? 's' : ''} · {errorCount} error{errorCount !== 1 ? 'es' : ''}
            </>
          }
          actions={commonActions}
        />

        <Card>
          <CardHeader
            title="Filas a importar"
            subtitle="Revisa los datos antes de confirmar. Las filas con error no se importarán."
          />
          {preview.length === 0 ? (
            <EmptyState title="Sin filas" description="No se detectaron filas de datos en el archivo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Símbolo</th>
                    <th className="px-3 py-3 font-medium">Tipo</th>
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-3 text-right font-medium">Precio</th>
                    <th className="px-3 py-3 text-right font-medium">Comisiones</th>
                    <th className="px-3 py-3 font-medium">Divisa</th>
                    <th className="px-5 py-3 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((item) => {
                    const hasErrors = item.errors.length > 0;
                    const asset = symbolsByAsset.get((item.values.symbol ?? '').trim().toUpperCase());
                    return (
                      <tr
                        key={item.rowNumber}
                        className={`border-b border-line/60 transition last:border-0 hover:bg-surface-2/60 ${
                          hasErrors ? 'bg-down/5' : ''
                        }`}
                      >
                        <td className="px-5 py-3 text-right tabular text-muted">
                          {item.rowNumber}
                        </td>
                        <td className="px-3 py-3 tabular">
                          {item.values.symbol ?? ''}
                          {asset ? <span className="ml-1 text-[10px] text-muted">{asset.currency}</span> : null}
                        </td>
                        <td className="px-3 py-3 tabular">
                          {TYPE_LABELS[item.values.type as TransactionType] ?? item.values.type}
                        </td>
                        <td className="px-3 py-3 tabular text-muted">{item.values.trade_date}</td>
                        <td className="px-3 py-3 text-right tabular">{item.values.quantity}</td>
                        <td className="px-3 py-3 text-right tabular">{item.values.unit_price}</td>
                        <td className="px-3 py-3 text-right tabular text-muted">{item.values.fees ?? '0'}</td>
                        <td className="px-3 py-3 tabular text-muted">{item.values.currency ?? 'EUR'}</td>
                        <td className="px-5 py-3 text-right">
                          {hasErrors ? (
                            <Badge tone="down">{item.errors.length} error{item.errors.length !== 1 ? 'es' : ''}</Badge>
                          ) : (
                            <Badge tone="neutral">Válida</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {errorCount > 0 && (
            <div className="mt-4 p-3 rounded-lg border border-down/30 bg-down/10 text-xs text-down">
              <p className="font-semibold mb-1">Filas con errores:</p>
              <ul className="space-y-1">
                {preview
                  .filter((item) => item.errors.length > 0)
                  .flatMap((item) =>
                    item.errors.map((err) => (
                      <li key={`${item.rowNumber}-${err.field}`}>
                        Fila {item.rowNumber} · {err.field}: {err.message}
                      </li>
                    ))
                  )}
              </ul>
            </div>
          )}
        </Card>

        <div className="flex justify-between pt-4">
          <Button variant="subtle" onClick={() => setStep('mapping')}>
            Volver al mapeo
          </Button>
          <Button
            variant="primary"
            disabled={validCount === 0 || submitting}
            onClick={submitImport}
          >
            {submitting ? 'Importando…' : `Importar ${validCount} operación${validCount !== 1 ? 'es' : ''}`}
          </Button>
        </div>
      </div>
    );
  }

  // step === 'done'
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Importación completada" actions={commonActions} />
      <Card>
        <CardHeader title="Operaciones importadas" />
        <div className="space-y-4">
          {message ? <p className="text-sm text-ink">{message}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Importadas" value={preview.filter((r) => r.errors.length === 0).length.toString()} />
            <Stat
              label="Omitidas"
              value={preview.filter((r) => r.errors.length > 0).length.toString()}
              tone="text-down"
            />
            <Stat label="Total filas" value={preview.length.toString()} />
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="primary" onClick={() => navigate('/operaciones')}>
            Ver operaciones
          </Button>
        </div>
      </Card>
    </div>
  );
};
