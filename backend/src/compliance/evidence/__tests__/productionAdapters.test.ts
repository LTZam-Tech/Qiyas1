import net from 'net';
import { evidenceDepsFromEnv } from '../../runtime';
import { ClamAvScanner, MinioStorage } from '../productionAdapters';
import { DevScanner, EICAR_TEST_STRING, LocalDiskStorage } from '../storage';

/** A fake clamd: answers PING, and INSTREAM with FOUND when the stream holds EICAR. */
function fakeClamd(mode: 'normal' | 'silent' | 'limit' = 'normal'): Promise<{ port: number; close: () => void; received: Buffer[] }> {
  const received: Buffer[] = [];
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (mode === 'silent') return;
        if (buf.toString('latin1').startsWith('zPING\0')) { socket.end('PONG\0'); return; }
        if (!buf.toString('latin1').startsWith('zINSTREAM\0')) return;
        // parse <len><data>… until a zero-length chunk
        let i = 10; const parts: Buffer[] = [];
        while (i + 4 <= buf.length) {
          const len = buf.readUInt32BE(i);
          if (len === 0) {
            const content = Buffer.concat(parts);
            received.push(content);
            if (mode === 'limit') socket.end('INSTREAM size limit exceeded. ERROR\0');
            else socket.end(content.includes(EICAR_TEST_STRING) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
            return;
          }
          if (i + 4 + len > buf.length) return;
          parts.push(buf.subarray(i + 4, i + 4 + len));
          i += 4 + len;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close(), received }));
  });
}

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('ClamAV scanner', () => {
  it('streams the file in chunks and reads clean / infected answers', async () => {
    const clamd = await fakeClamd();
    const scanner = new ClamAvScanner({ host: '127.0.0.1', port: clamd.port });
    const big = Buffer.alloc(200 * 1024, 7);
    expect(await scanner.scan(big, 'big.pdf')).toBe('clean');
    expect(clamd.received[0].equals(big)).toBe(true);
    expect(await scanner.scan(Buffer.from(`x${EICAR_TEST_STRING}x`), 'a.pdf')).toBe('infected');
    expect(await scanner.ping()).toBe(true);
    clamd.close();
  });

  it('fails closed: limits, silence and an absent daemon are errors, never clean', async () => {
    const limit = await fakeClamd('limit');
    expect(await new ClamAvScanner({ host: '127.0.0.1', port: limit.port }).scan(Buffer.from('x'), 'a.pdf')).toBe('error');
    limit.close();
    const silent = await fakeClamd('silent');
    expect(await new ClamAvScanner({ host: '127.0.0.1', port: silent.port, timeoutMs: 200 }).scan(Buffer.from('x'), 'a.pdf')).toBe('error');
    silent.close();
    expect(await new ClamAvScanner({ host: '127.0.0.1', port: 1 }).scan(Buffer.from('x'), 'a.pdf')).toBe('error');
    expect(await new ClamAvScanner({ host: '127.0.0.1', port: 1 }).ping()).toBe(false);
  });
});

describe('choosing storage and scanner from the environment', () => {
  it('development defaults to a folder and the EICAR-only scanner', () => {
    const deps = evidenceDepsFromEnv(log, { NODE_ENV: 'development' });
    expect(deps.storage).toBeInstanceOf(LocalDiskStorage);
    expect(deps.scanner).toBeInstanceOf(DevScanner);
  });

  it('production refuses to start without ClamAV unless explicitly allowed', () => {
    expect(() => evidenceDepsFromEnv(log, { NODE_ENV: 'production' })).toThrow(/ClamAV/);
    expect(evidenceDepsFromEnv(log, { NODE_ENV: 'production', QIYAS_ALLOW_DEV_SCANNER: 'true' }).scanner).toBeInstanceOf(DevScanner);
  });

  it('uses MinIO and ClamAV when configured', () => {
    const deps = evidenceDepsFromEnv(log, {
      NODE_ENV: 'production', QIYAS_STORAGE: 'minio', MINIO_ENDPOINT: 'minio', MINIO_ROOT_USER: 'qiyas', MINIO_ROOT_PASSWORD: 'secret-secret', QIYAS_CLAMAV_HOST: 'clamav',
    });
    expect(deps.storage).toBeInstanceOf(MinioStorage);
    expect(deps.scanner).toBeInstanceOf(ClamAvScanner);
    expect(() => evidenceDepsFromEnv(log, { QIYAS_STORAGE: 'minio' })).toThrow(/MINIO_ENDPOINT/);
  });
});
