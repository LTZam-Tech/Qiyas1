import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage, LocalDiskStorage, objectKey, sha256Hex } from '../storage';

describe('content-addressed evidence storage', () => {
  it('stores the same content once and never uses the file name', async () => {
    const s = new InMemoryStorage();
    const a = await s.put(Buffer.from('strategic plan'));
    const b = await s.put(Buffer.from('strategic plan'));
    expect(a).toEqual(b);
    expect(s.size).toBe(1);
    expect(a.key).toBe(objectKey(sha256Hex(Buffer.from('strategic plan'))));
    expect((await s.get(a.key)).toString()).toBe('strategic plan');
  });

  it('local disk storage round-trips and refuses keys outside its folder', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qiyas-store-'));
    try {
      const s = new LocalDiskStorage(root);
      const o = await s.put(Buffer.from('report'));
      expect(await s.exists(o.key)).toBe(true);
      expect((await s.get(o.key)).toString()).toBe('report');
      await s.put(Buffer.from('report')); // second write is a no-op
      await expect(s.get('../../etc/passwd')).rejects.toThrow('Invalid object key');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the development scanner flags the EICAR test file', async () => {
    const scanner = new DevScanner();
    expect(await scanner.scan(Buffer.from('ok'), 'a.pdf')).toBe('clean');
    expect(await scanner.scan(Buffer.from(EICAR_TEST_STRING), 'eicar.com')).toBe('infected');
  });
});
