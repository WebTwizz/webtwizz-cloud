import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import { MESSAGES } from './errors';

export type Bucket = 'public' | 'private';

export type UploadRequest = {
  bucket: Bucket;
  name: string;
  type: string;
  size: number;
  folder?: string;
  accept?: string[];
};

export type Upload = {
  url: string;
  key: string;
  headers: Record<string, string>;
};

export class FileError extends Error {
  constructor(public code: 'too_large' | 'type', message: string) {
    super(message);
    this.name = 'FileError';
  }
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

export function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|-+$/g, '');
  return cleaned.slice(-80) || 'file';
}

export function accepts(type: string, accept: string[]): boolean {
  return accept.some((rule) => (rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule));
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export function createFiles() {
  const endpoint = env('WEBTWIZZ_STORAGE_ENDPOINT').replace(/\/+$/, '');
  const filesUrl = (process.env.WEBTWIZZ_FILES_URL || endpoint).replace(/\/+$/, '');
  const region = env('WEBTWIZZ_STORAGE_REGION');
  const client = (key: string, secret: string) =>
    new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: env(key), secretAccessKey: env(secret) },
    });
  const writer = client('WEBTWIZZ_STORAGE_KEY', 'WEBTWIZZ_STORAGE_SECRET');
  let reader: S3Client | undefined;
  const maxFileMb = Number(process.env.WEBTWIZZ_STORAGE_MAX_FILE_MB) || 0;

  return {
    maxFileMb,

    /** A 5-minute link the browser PUTs the file to, with the exact headers it must send. */
    async uploadUrl({ bucket, name, type, size, folder, accept }: UploadRequest): Promise<Upload> {
      if (maxFileMb && size > maxFileMb * 1024 * 1024) throw new FileError('too_large', MESSAGES.fileTooLarge(maxFileMb));
      if (accept && !accepts(type, accept)) throw new FileError('type', MESSAGES.fileType);
      const prefix = folder ? `${folder.split('/').map(safeName).join('/')}/` : '';
      const key = `${prefix}${crypto.randomUUID()}-${safeName(name)}`;
      const headers: Record<string, string> = { 'Content-Type': type };
      if (bucket === 'public') headers['Cache-Control'] = IMMUTABLE;
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: type,
        ContentLength: size,
        CacheControl: headers['Cache-Control'],
      });
      const url = await getSignedUrl(writer, command, {
        expiresIn: 300,
        signableHeaders: new Set(['content-type', 'content-length']),
      });
      return { url, key, headers };
    },

    publicUrl(key: string): string {
      return `${filesUrl}/public/${encodeKey(key)}`;
    },

    /** A short-lived link to a private file; check the visitor may see it first. */
    async privateUrl(key: string, { expiresIn = 300, download }: { expiresIn?: number; download?: string } = {}): Promise<string> {
      reader ??= client('WEBTWIZZ_STORAGE_READ_KEY', 'WEBTWIZZ_STORAGE_READ_SECRET');
      const command = new GetObjectCommand({
        Bucket: 'private',
        Key: key,
        ResponseContentDisposition: download ? `attachment; filename="${safeName(download)}"` : undefined,
      });
      const url = await getSignedUrl(reader, command, { expiresIn });
      return url.startsWith(`${endpoint}/`) ? filesUrl + url.slice(endpoint.length) : url;
    },

    async remove(bucket: Bucket, key: string): Promise<void> {
      await writer.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export type Files = ReturnType<typeof createFiles>;
