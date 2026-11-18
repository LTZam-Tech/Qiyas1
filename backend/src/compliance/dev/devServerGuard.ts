/**
 * Guard for the local Phase 1 dev server (lead N4). Pure functions so they can be unit-tested.
 *
 * The dev server signs anyone in without a password. It must only ever run on purpose, on a
 * developer machine, and only answer requests made directly from that machine.
 */
import { randomBytes } from 'crypto';

/** Why the dev server must not start in this environment, or null when it may. */
export function devServerStartRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === 'production') return 'refusing to start: NODE_ENV=production (the dev server signs anyone in without a password)';
  if (env.QIYAS_DEV_SERVER !== '1') return 'refusing to start: set QIYAS_DEV_SERVER=1 to run the local dev server (npm run dev:phase1 does this)';
  return null;
}

/** A fresh signing secret for each run, so demo tokens cannot be forged from the source code. */
export const newDevSecret = (): string => randomBytes(32).toString('hex');

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface LocalRequestFacts {
  remoteAddress: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/** The hostname part of a Host header, lower-cased ("[::1]:8082" -> "[::1]", "localhost:8082" -> "localhost"). */
function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  const colon = h.indexOf(':');
  return colon === -1 ? h : h.slice(0, colon);
}

/**
 * Why a request must be rejected, or null when it comes straight from this machine.
 * Rejects non-loopback peers, anything carrying proxy headers (a same-host reverse proxy
 * would otherwise make public traffic look local), and any Host other than localhost.
 */
export function devRequestRejection({ remoteAddress, headers }: LocalRequestFacts): string | null {
  if (!remoteAddress || !LOOPBACK_ADDRESSES.has(remoteAddress)) return 'not a loopback peer';
  if (headers['x-forwarded-for'] !== undefined || headers['forwarded'] !== undefined || headers['x-real-ip'] !== undefined) {
    return 'proxied request';
  }
  const host = headers.host;
  if (typeof host !== 'string' || !LOCAL_HOSTNAMES.has(hostName(host))) return 'non-localhost Host header';
  return null;
}
