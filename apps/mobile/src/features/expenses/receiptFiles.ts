import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { receiptAttachmentSchema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
const directory = () => new Directory(Paths.document, 'receipt-uploads');
function localFile(name: string) {
  if (!/^[a-f0-9-]{36}$/.test(name)) throw new ApiError('INVALID_RESPONSE');
  return new File(directory(), name);
}
export interface SelectedReceipt {
  file: string;
  contentType: 'image/jpeg' | 'application/pdf';
  size: number;
}
export async function removeReceiptFile(name: string) {
  const file = localFile(name);
  if (file.exists) file.delete();
}
export async function cleanupReceiptFiles(referenced: string[]) {
  const dir = directory();
  if (!dir.exists) return;
  const keep = new Set(referenced);
  for (const file of dir.list())
    if (
      file instanceof File &&
      !keep.has(file.name) &&
      (file.modificationTime ?? Date.now()) < Date.now() - 86_400_000
    )
      file.delete();
}
export async function pickReceipt(
  source: 'camera' | 'library' | 'pdf'
): Promise<SelectedReceipt | null> {
  let uri: string;
  let contentType: SelectedReceipt['contentType'];
  const temporary: string[] = [];
  try {
    if (source === 'pdf') {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return null;
      uri = result.assets[0].uri;
      temporary.push(uri);
      contentType = 'application/pdf';
    } else {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        throw new ApiError('RECEIPT_PERMISSION');
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        exif: false,
        quality: 1,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return null;
      const asset = result.assets[0];
      temporary.push(asset.uri);
      const context = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > 2400)
        context.resize(asset.width >= asset.height ? { width: 2400 } : { height: 2400 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      uri = saved.uri;
      temporary.push(uri);
      image.release();
      context.release();
      contentType = 'image/jpeg';
    }
    const sourceFile = new File(uri);
    const size = sourceFile.size;
    if (!receiptAttachmentSchema.shape.size.safeParse(size).success)
      throw new ApiError('RECEIPT_FILE_SIZE');
    const dir = directory();
    dir.create({ idempotent: true, intermediates: true });
    const file = randomUUID();
    await sourceFile.copy(localFile(file));
    return { file, contentType, size };
  } finally {
    for (const uri of new Set(temporary)) {
      // Only picker/manipulator cache copies; never remove source photos or provider documents.
      if (uri.startsWith(Paths.cache.uri)) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {
          /* OS cache eviction remains safe. */
        }
      }
    }
  }
}
export async function uploadReceiptFile(
  name: string,
  ticket: { url: string; contentType: string },
  check: () => void
) {
  const file = localFile(name);
  if (!file.exists) throw new ApiError('RECEIPT_FILE_MISSING');
  check();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const guardTimer = setInterval(() => {
    try {
      check();
    } catch {
      controller.abort();
    }
  }, 250);
  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') controller.abort();
  });
  try {
    const result = await file.upload(ticket.url, {
      httpMethod: 'PUT',
      sessionType: 'foreground',
      signal: controller.signal,
      headers: { 'Content-Type': ticket.contentType, 'If-None-Match': '*' },
    });
    // 412 is an earlier immutable PUT; finish still verifies HEAD before attaching anything.
    if (!(result.status >= 200 && result.status < 300) && result.status !== 412)
      throw new ApiError('UPLOAD_INCOMPLETE');
  } finally {
    clearTimeout(timer);
    clearInterval(guardTimer);
    sub.remove();
  }
}
