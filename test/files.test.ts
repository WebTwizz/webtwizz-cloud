import { beforeEach, describe, expect, it } from 'vitest';
import { FileError, accepts, createFiles, safeName } from '../src/files';

const ENDPOINT = 'https://br-test.storage.us-east-1.example.com';

beforeEach(() => {
  Object.assign(process.env, {
    WEBTWIZZ_STORAGE_ENDPOINT: ENDPOINT,
    WEBTWIZZ_STORAGE_REGION: 'us-east-1',
    WEBTWIZZ_STORAGE_KEY: 'write-key',
    WEBTWIZZ_STORAGE_SECRET: 'write-secret',
    WEBTWIZZ_STORAGE_READ_KEY: 'read-key',
    WEBTWIZZ_STORAGE_READ_SECRET: 'read-secret',
    WEBTWIZZ_STORAGE_MAX_FILE_MB: '10',
    WEBTWIZZ_FILES_URL: 'https://files.example.com/br-test',
  });
});

describe('files', () => {
  it('signs an upload to the storage endpoint that holds the size and type', async () => {
    const upload = await createFiles().uploadUrl({ bucket: 'public', name: 'My Photo (1).JPG', type: 'image/jpeg', size: 1234, folder: 'user-1' });
    const url = new URL(upload.url);
    expect(url.origin + url.pathname).toBe(`https://files.example.com/br-test/public/${upload.key}`);
    expect(upload.key).toMatch(/^user-1\/[0-9a-f-]{36}-My-Photo-1-.JPG$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  });

  it('keeps private uploads uncached', async () => {
    const upload = await createFiles().uploadUrl({ bucket: 'private', name: 'cv.pdf', type: 'application/pdf', size: 10 });
    expect(upload.headers).toEqual({ 'Content-Type': 'application/pdf' });
  });

  it('refuses files over the limit and types the feature does not take', async () => {
    const files = createFiles();
    await expect(files.uploadUrl({ bucket: 'public', name: 'big.png', type: 'image/png', size: 11 * 1024 * 1024 }))
      .rejects.toMatchObject({ code: 'too_large', message: 'That file is too big. The limit is 10 MB.' });
    await expect(files.uploadUrl({ bucket: 'public', name: 'x.exe', type: 'application/x-msdownload', size: 1, accept: ['image/*'] }))
      .rejects.toBeInstanceOf(FileError);
  });

  it('links public files on the files address', () => {
    expect(createFiles().publicUrl('user 1/a b.png')).toBe('https://files.example.com/br-test/public/user%201/a%20b.png');
  });

  it('moves private links onto the files address and keeps the signature', async () => {
    const url = new URL(await createFiles().privateUrl('user-1/cv.pdf', { download: 'My CV.pdf' }));
    expect(url.origin + url.pathname).toBe('https://files.example.com/br-test/private/user-1/cv.pdf');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^read-key\//);
    expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="My-CV.pdf"');
  });

  it('falls back to the endpoint when there is no files address', async () => {
    delete process.env.WEBTWIZZ_FILES_URL;
    expect(createFiles().publicUrl('a.png')).toBe(`${ENDPOINT}/public/a.png`);
    expect((await createFiles().uploadUrl({ bucket: 'public', name: 'a.png', type: 'image/png', size: 1 })).url.startsWith(`${ENDPOINT}/public/`)).toBe(true);
    expect((await createFiles().privateUrl('a.pdf')).startsWith(`${ENDPOINT}/private/a.pdf?`)).toBe(true);
  });

  it('says which setting is missing', () => {
    delete process.env.WEBTWIZZ_STORAGE_ENDPOINT;
    expect(() => createFiles()).toThrow(/WEBTWIZZ_STORAGE_ENDPOINT is not set/);
  });

  it('makes names safe for keys', () => {
    expect(safeName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeName('Café menu.pdf')).toBe('Cafe-menu.pdf');
    expect(safeName('***')).toBe('file');
    expect(accepts('image/png', ['image/*'])).toBe(true);
    expect(accepts('application/pdf', ['image/*', 'application/pdf'])).toBe(true);
    expect(accepts('text/html', ['image/*'])).toBe(false);
  });
});
