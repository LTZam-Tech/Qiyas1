/**
 * N4: the Phase 1 dev server signs anyone in without a password and was isolated only by a
 * loopback bind, with a constant HMAC secret in the source. A same-host reverse proxy, or a
 * start under NODE_ENV=production, exposed it. These tests cover the guard it now applies.
 */
import { devRequestRejection, devServerStartRefusal, newDevSecret } from '../devServerGuard';

describe('devServerStartRefusal (N4)', () => {
  it('refuses to start under NODE_ENV=production, even with QIYAS_DEV_SERVER=1', () => {
    expect(devServerStartRefusal({ NODE_ENV: 'production', QIYAS_DEV_SERVER: '1' })).toMatch(/NODE_ENV=production/);
  });

  it('refuses to start without QIYAS_DEV_SERVER=1', () => {
    expect(devServerStartRefusal({})).toMatch(/QIYAS_DEV_SERVER=1/);
    expect(devServerStartRefusal({ NODE_ENV: 'development', QIYAS_DEV_SERVER: 'true' })).toMatch(/QIYAS_DEV_SERVER=1/);
    expect(devServerStartRefusal({ QIYAS_DEV_SERVER: '0' })).toMatch(/QIYAS_DEV_SERVER=1/);
  });

  it('starts with QIYAS_DEV_SERVER=1 outside production (positive control)', () => {
    expect(devServerStartRefusal({ QIYAS_DEV_SERVER: '1' })).toBeNull();
    expect(devServerStartRefusal({ NODE_ENV: 'development', QIYAS_DEV_SERVER: '1' })).toBeNull();
  });
});

describe('newDevSecret (N4)', () => {
  it('is random per run and is not the old constant', () => {
    const a = newDevSecret();
    const b = newDevSecret();
    expect(a).not.toEqual(b);
    expect(a).not.toEqual('qiyas-dev-only-secret');
    expect(a.length).toBeGreaterThanOrEqual(64);
  });
});

describe('devRequestRejection (N4)', () => {
  const direct = { remoteAddress: '127.0.0.1', headers: { host: '127.0.0.1:8082' } };

  it('accepts direct loopback requests with a localhost Host (positive control)', () => {
    expect(devRequestRejection(direct)).toBeNull();
    expect(devRequestRejection({ remoteAddress: '::1', headers: { host: 'localhost:8082' } })).toBeNull();
    expect(devRequestRejection({ remoteAddress: '::ffff:127.0.0.1', headers: { host: '[::1]:8082' } })).toBeNull();
    expect(devRequestRejection({ remoteAddress: '127.0.0.1', headers: { host: 'LOCALHOST' } })).toBeNull();
  });

  it('rejects a non-loopback peer', () => {
    expect(devRequestRejection({ ...direct, remoteAddress: '192.168.1.20' })).toBe('not a loopback peer');
    expect(devRequestRejection({ ...direct, remoteAddress: '::ffff:10.0.0.5' })).toBe('not a loopback peer');
    expect(devRequestRejection({ ...direct, remoteAddress: undefined })).toBe('not a loopback peer');
  });

  it('rejects a loopback request relayed by a same-host proxy (X-Forwarded-For, Forwarded, X-Real-IP)', () => {
    expect(devRequestRejection({ ...direct, headers: { ...direct.headers, 'x-forwarded-for': '203.0.113.9' } })).toBe('proxied request');
    expect(devRequestRejection({ ...direct, headers: { ...direct.headers, forwarded: 'for=203.0.113.9' } })).toBe('proxied request');
    expect(devRequestRejection({ ...direct, headers: { ...direct.headers, 'x-real-ip': '203.0.113.9' } })).toBe('proxied request');
  });

  it('rejects a non-localhost Host header (the Caddy path: public name proxied to 127.0.0.1:8082)', () => {
    expect(devRequestRejection({ ...direct, headers: { host: 'qiyas.example.com' } })).toBe('non-localhost Host header');
    expect(devRequestRejection({ ...direct, headers: { host: 'localhost.example.com' } })).toBe('non-localhost Host header');
    expect(devRequestRejection({ ...direct, headers: { host: '192.168.1.20:8082' } })).toBe('non-localhost Host header');
    expect(devRequestRejection({ ...direct, headers: {} })).toBe('non-localhost Host header');
  });
});
