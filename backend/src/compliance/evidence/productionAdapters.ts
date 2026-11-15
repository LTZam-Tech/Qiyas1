/**
 * Production evidence storage and virus scanning (docs/phase1/09-deployment.md §2, §5).
 *
 *   MinioStorage   — S3-compatible object storage (MinIO on premises). Objects are
 *                    content-addressed (objects/ab/<sha256>), private, optionally
 *                    encrypted server side; files are streamed through the API, never
 *                    exposed by public URL.
 *   ClamAvScanner  — clamd over TCP (INSTREAM). Anything but a clean answer is an
 *                    error, so a scanner outage never lets a file through as clean.
 */
import net from 'net';
import { Client as MinioClient } from 'minio';
import { EvidenceStorage, ScanResult, StoredObject, VirusScanner, objectKey, sha256Hex } from './storage';

export interface MinioOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
  /** Ask MinIO to encrypt objects (needs a KMS configured on the MinIO server). */
  serverSideEncryption?: boolean;
}

export class MinioStorage implements EvidenceStorage {
  private readonly client: MinioClient;
  private ready: Promise<void> | null = null;

  constructor(private readonly opts: MinioOptions) {
    this.client = new MinioClient({ endPoint: opts.endPoint, port: opts.port, useSSL: opts.useSSL, accessKey: opts.accessKey, secretKey: opts.secretKey, region: opts.region });
  }

  /** Creates the bucket on first use (private by default). */
  private ensureBucket(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        if (!(await this.client.bucketExists(this.opts.bucket))) await this.client.makeBucket(this.opts.bucket, this.opts.region ?? 'us-east-1');
      })().catch((e) => { this.ready = null; throw e; });
    }
    return this.ready;
  }

  async put(content: Buffer): Promise<StoredObject> {
    await this.ensureBucket();
    const sha = sha256Hex(content);
    const key = objectKey(sha);
    if (!(await this.exists(key))) {
      const meta: Record<string, string> = { 'Content-Type': 'application/octet-stream', 'x-amz-meta-sha256': sha };
      if (this.opts.serverSideEncryption) meta['X-Amz-Server-Side-Encryption'] = 'AES256';
      await this.client.putObject(this.opts.bucket, key, content, content.length, meta);
    }
    return { key, sha256: sha, sizeBytes: content.length };
  }

  async get(key: string): Promise<Buffer> {
    await this.ensureBucket();
    const stream = await this.client.getObject(this.opts.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const content = Buffer.concat(chunks);
    // content addressing doubles as an integrity check
    const expected = key.split('/').pop();
    if (expected && /^[0-9a-f]{64}$/.test(expected) && sha256Hex(content) !== expected) throw new Error(`Stored object ${key} failed its integrity check`);
    return content;
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureBucket();
    try {
      await this.client.statObject(this.opts.bucket, key);
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === 'NotFound' || (e as { code?: string }).code === 'NoSuchKey') return false;
      throw e;
    }
  }

  /** For health checks: the bucket can be reached. */
  async ping(): Promise<boolean> {
    await this.ensureBucket();
    return true;
  }
}

export interface ClamAvOptions {
  host: string;
  port: number;
  timeoutMs?: number;
}

/** Talks to clamd: a command, then the reply up to the NUL terminator. */
function clamd(opts: ClamAvOptions, write: (socket: net.Socket) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: opts.host, port: opts.port });
    const chunks: Buffer[] = [];
    let settled = false;
    const done = (err: Error | null, reply?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err); else resolve(reply!);
    };
    socket.setTimeout(opts.timeoutMs ?? 60_000, () => done(new Error('ClamAV did not answer in time')));
    socket.on('error', (e) => done(e));
    socket.on('data', (d) => {
      chunks.push(d);
      const all = Buffer.concat(chunks);
      const end = all.indexOf(0);
      if (end >= 0) done(null, all.subarray(0, end).toString('utf8').trim());
    });
    socket.on('end', () => done(null, Buffer.concat(chunks).toString('utf8').replace(/\0+$/, '').trim()));
    socket.on('connect', () => write(socket));
  });
}

export class ClamAvScanner implements VirusScanner {
  constructor(private readonly opts: ClamAvOptions) {}

  async scan(content: Buffer, _filename: string): Promise<ScanResult> {
    try {
      const reply = await clamd(this.opts, (socket) => {
        socket.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let i = 0; i < content.length; i += CHUNK) {
          const part = content.subarray(i, i + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length, 0);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
      if (/:\s*OK$/.test(reply)) return 'clean';
      if (/FOUND$/.test(reply)) return 'infected';
      return 'error'; // e.g. "INSTREAM size limit exceeded"
    } catch {
      return 'error';
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await clamd({ ...this.opts, timeoutMs: 5000 }, (s) => s.write('zPING\0'))) === 'PONG';
    } catch {
      return false;
    }
  }
}
