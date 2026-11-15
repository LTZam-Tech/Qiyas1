/**
 * Evidence file storage and virus scanning (BR-EVD-08, 06-evidence-bank.md §7).
 *
 * Objects are content-addressed by SHA-256, so evidence reused in a later
 * cycle points at the same stored object (BNK-3). Keys never contain the
 * original file name (BR-FILE-02). Production uses MinIO and ClamAV behind
 * these interfaces; the local implementations serve development and tests.
 */
import { createHash } from 'crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

export interface StoredObject {
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface EvidenceStorage {
  put(content: Buffer): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export type ScanResult = 'clean' | 'infected' | 'error';
export interface VirusScanner {
  scan(content: Buffer, filename: string): Promise<ScanResult>;
}

export const sha256Hex = (content: Buffer) => createHash('sha256').update(content).digest('hex');
export const objectKey = (sha: string) => `objects/${sha.slice(0, 2)}/${sha}`;

export class InMemoryStorage implements EvidenceStorage {
  private readonly objects = new Map<string, Buffer>();
  async put(content: Buffer): Promise<StoredObject> {
    const sha = sha256Hex(content);
    const key = objectKey(sha);
    if (!this.objects.has(key)) this.objects.set(key, Buffer.from(content));
    return { key, sha256: sha, sizeBytes: content.length };
  }
  async get(key: string): Promise<Buffer> {
    const v = this.objects.get(key);
    if (!v) throw new Error(`Object ${key} not found`);
    return v;
  }
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  get size(): number {
    return this.objects.size;
  }
}

export class LocalDiskStorage implements EvidenceStorage {
  constructor(private readonly root: string) {}
  private file(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root))) throw new Error('Invalid object key');
    return resolved;
  }
  async put(content: Buffer): Promise<StoredObject> {
    const sha = sha256Hex(content);
    const key = objectKey(sha);
    const file = this.file(key);
    if (!existsSync(file)) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content, { flag: 'wx' });
    }
    return { key, sha256: sha, sizeBytes: content.length };
  }
  async get(key: string): Promise<Buffer> {
    return readFileSync(this.file(key));
  }
  async exists(key: string): Promise<boolean> {
    return existsSync(this.file(key));
  }
}

/** EICAR is the standard harmless antivirus test string. */
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** Development scanner: flags the EICAR test file only. Never use in production. */
export class DevScanner implements VirusScanner {
  async scan(content: Buffer, _filename: string): Promise<ScanResult> {
    return content.includes(EICAR) ? 'infected' : 'clean';
  }
}

export const EICAR_TEST_STRING = EICAR;
