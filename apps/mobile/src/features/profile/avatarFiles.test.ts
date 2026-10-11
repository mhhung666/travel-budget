import { beforeEach, expect, it, vi } from 'vitest';
import { pickAvatar, uploadAvatarFile } from './avatarFiles';
const h = vi.hoisted(() => ({
  pick: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  resize: vi.fn(),
  copy: vi.fn(),
  remove: vi.fn(),
  release: vi.fn(),
  upload: vi.fn(),
  size: 100,
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: h.pick }));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({ resize: h.resize, renderAsync: h.render, release: h.release }),
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file://documents/' }, cache: { uri: 'file://cache/' } },
  Directory: class {
    create = vi.fn();
    uri = 'file://documents/avatar-uploads/';
  },
  File: class {
    uri: string;
    exists = true;
    size = h.size;
    constructor(a: string | { uri: string }, b?: string) {
      this.uri = typeof a === 'string' ? a : a.uri + b;
    }
    copy = h.copy;
    delete = () => h.remove(this.uri);
    upload = h.upload;
  },
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
beforeEach(() => {
  vi.clearAllMocks();
  h.size = 100;
  h.pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'ph://library-original', width: 3024, height: 4032 }],
  });
  h.render.mockResolvedValue({ saveAsync: h.save, release: h.release });
  h.save.mockResolvedValue({ uri: 'file://cache/avatar.jpg' });
});
it('uses explicit system image selection, scales to 512 JPEG and cleans only cache copies', async () => {
  expect(await pickAvatar()).toMatchObject({ contentType: 'image/jpeg', size: 100 });
  expect(h.pick).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    exif: false,
    quality: 1,
  });
  expect(h.resize).toHaveBeenCalledWith({ height: 512 });
  expect(h.save).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
  expect(h.remove).toHaveBeenCalledWith('file://cache/avatar.jpg');
  expect(h.remove).not.toHaveBeenCalledWith('ph://library-original');
});
it('cancellation creates no local file; picker permission/access failure is actionable', async () => {
  h.pick.mockResolvedValueOnce({ canceled: true });
  expect(await pickAvatar()).toBeNull();
  expect(h.copy).not.toHaveBeenCalled();
  h.pick.mockRejectedValueOnce(new Error('permission denied'));
  await expect(pickAvatar()).rejects.toMatchObject({ code: 'AVATAR_PICK_FAILED' });
  expect(h.copy).not.toHaveBeenCalled();
});
it('rejects empty/oversized transformed files before copying and releases native resources', async () => {
  for (const size of [0, 4 * 1024 * 1024 + 1]) {
    h.size = size;
    await expect(pickAvatar()).rejects.toMatchObject({ code: 'AVATAR_FILE_SIZE' });
  }
  expect(h.copy).not.toHaveBeenCalled();
  expect(h.release).toHaveBeenCalledTimes(4);
});
it('uploads immutable bytes without bearer headers; 412 continues to server verification and guard prevents transfer', async () => {
  const ticket = { url: 'https://put.example.invalid', contentType: 'image/jpeg' };
  h.upload.mockResolvedValue({ status: 412 });
  const check = vi.fn();
  await uploadAvatarFile('11111111-1111-4111-8111-111111111111', ticket, check);
  expect(h.upload.mock.calls[0][1].headers).toEqual({
    'Content-Type': 'image/jpeg',
    'If-None-Match': '*',
  });
  expect(check).toHaveBeenCalled();
  h.upload.mockClear();
  await expect(
    uploadAvatarFile('11111111-1111-4111-8111-111111111111', ticket, () => {
      throw new Error('changed account');
    })
  ).rejects.toThrow('changed account');
  expect(h.upload).not.toHaveBeenCalled();
});
