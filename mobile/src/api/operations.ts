import { client, get, patch, post } from '@/api/client';
import type {
  AlertDetail,
  ClinicUser,
  DiscrepancyPage,
  InventoryAlertReport,
  MedicineRecord,
  ScanPage,
  ScanRecord,
  ShelfRecord,
  StockRow,
} from '@/types';

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[triple & 63] : '=';
  }
  return output;
}

function toBytes(data: unknown) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') {
    const bytes = new Uint8Array(data.length);
    for (let index = 0; index < data.length; index += 1) bytes[index] = data.charCodeAt(index) & 0xff;
    return bytes;
  }
  throw new Error('The scan image could not be read');
}

export const operationsApi = {
  shelves: (q = '') => get<{ shelves: ShelfRecord[] }>(`/api/shelves${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  shelf: (id: string) => get<ShelfRecord>(`/api/shelves/${id}`),
  createShelf: (body: unknown) => post<ShelfRecord>('/api/shelves', body),
  medicines: (q = '') => get<MedicineRecord[]>(`/api/medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  stock: () => get<{ stock: StockRow[] }>('/api/inventory/stock'),
  inventoryAlerts: () => get<InventoryAlertReport>('/api/inventory/alerts'),
  scans: (page = 1, shelf = '') =>
    get<ScanPage>(`/api/scans?page=${page}&limit=20${shelf ? `&shelf=${encodeURIComponent(shelf)}` : ''}`),
  scan: (id: string) => get<ScanRecord>(`/api/scans/${id}`),
  createScan: (body: unknown, onProgress?: (fraction: number) => void) =>
    post<ScanRecord>('/api/scans', body, {
      timeout: 60000,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.min(1, event.loaded / event.total));
      },
    }),
  reviewScan: (id: string, note: string) =>
    post<ScanRecord>(`/api/scans/${id}/review`, { confirmed: true, note }),
  alerts: (page = 1) => get<DiscrepancyPage>(`/api/alerts?page=${page}&limit=20`),
  alert: (id: string) => get<AlertDetail>(`/api/alerts/${id}`),
  addAlertNote: (id: string, text: string) => post<AlertDetail>(`/api/alerts/${id}/notes`, { text }),
  updateAlert: (id: string, body: unknown) => patch<AlertDetail>(`/api/alerts/${id}`, body),
  users: () => get<ClinicUser[]>('/api/users'),
  async scanImageUri(id: string) {
    const response = await client.get(`/api/scans/${id}/image`, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    const mime = String(response.headers['content-type'] || 'image/jpeg').split(';')[0];
    return `data:${mime};base64,${bytesToBase64(toBytes(response.data))}`;
  },
};
