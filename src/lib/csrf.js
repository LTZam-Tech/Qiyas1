// CSRF token for state-changing requests (POST/PUT/PATCH/DELETE). The backend (csurf) keeps an httpOnly
// secret cookie and hands the matching token to the SPA in the readable, SameSite=strict csrfToken cookie.
import { env } from '../config/env.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const isMutating = (method = 'GET') => MUTATING.has(String(method).toUpperCase());

export function readCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let pending = null;

/** The token to send as x-csrf-token; fetched once from GET /api/v1/auth/csrf when the cookie is missing. */
export async function ensureCsrfToken() {
  const existing = readCsrfToken();
  if (existing) return existing;
  if (!pending) {
    const url = `${env.apiBaseUrl.replace(/\/$/, '')}/auth/csrf`;
    pending = fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => readCsrfToken() || body?.data?.csrfToken || null)
      .catch(() => null) // a server without CSRF protection (local dev server) simply has no token
      .finally(() => { pending = null; });
  }
  return pending;
}
