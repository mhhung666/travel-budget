import { pickReceipt, uploadReceiptFile, removeReceiptFile } from './receiptFiles';
import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  permission: vi.fn(),
  camera: vi.fn(),
  changed: (_s: string) => {},
  exists: true,
}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_e: string, f: typeof h.changed) => {
      h.changed = f;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' }, cache: { uri: 'file:///cache/' } },
  Directory: class {
    uri = 'file:///documents/receipt-uploads/';
  },
  File: class {
    exists = h.exists;
    upload = h.upload;
    delete = h.remove;
  },
}));
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: h.permission,
  launchCameraAsync: h.camera,
}));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-image-manipulator', () => ({}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
const name = '11111111-1111-4111-8111-111111111111';
const ticket = { url: 'https://private.test/upload', contentType: 'image/jpeg' };
beforeEach(() => {
  vi.clearAllMocks();
  h.exists = true;
  h.upload.mockResolvedValue({ status: 200 });
});
it('asks for camera permission only on camera action and rejects denied permission without opening it', async () => {
  h.permission.mockResolvedValue({ granted: false });
  await expect(pickReceipt('camera')).rejects.toMatchObject({ code: 'RECEIPT_PERMISSION' });
  expect(h.camera).not.toHaveBeenCalled();
});
it('uses foreground binary PUT with conditional header and no API credentials; aborts on background', async () => {
  h.upload.mockImplementation(async (_url, options) => {
    h.changed('background');
    expect(options.signal.aborted).toBe(true);
    return { status: 412 };
  });
  await uploadReceiptFile(name, ticket, () => {});
  expect(h.upload).toHaveBeenCalledWith(
    ticket.url,
    expect.objectContaining({
      httpMethod: 'PUT',
      sessionType: 'foreground',
      headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
    })
  );
  h.upload.mockResolvedValueOnce({ status: 500 });
  await expect(uploadReceiptFile(name, ticket, () => {})).rejects.toMatchObject({
    code: 'UPLOAD_INCOMPLETE',
  });
});
it('rejects missing files and traversal before transport or deletion', async () => {
  h.exists = false;
  await expect(uploadReceiptFile(name, ticket, () => {})).rejects.toMatchObject({
    code: 'RECEIPT_FILE_MISSING',
  });
  await expect(removeReceiptFile('../private')).rejects.toThrow();
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.remove).not.toHaveBeenCalled();
});
