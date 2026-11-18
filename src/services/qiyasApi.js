// Client for the Phase 1 API (/api/v2). Uses the same sign-in token as the rest of the app.
import { env } from '../config/env.js';
import { getAccessToken } from '../lib/authStorage.js';
import { ensureCsrfToken, isMutating } from '../lib/csrf.js';

const base = () => env.apiBaseUrl.replace(/\/v1\/?$/, '/v2');

export class ApiError extends Error {
  constructor(status, code, message, issues) {
    super(message);
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function call(method, path, body, { form = false, raw = false } = {}) {
  const headers = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isMutating(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base()}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  if (raw && res.ok) return res;
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json() : null;
  if (!res.ok || payload?.success === false) {
    const err = payload?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? payload?.message ?? `Request failed (${res.status})`, err.issues);
  }
  return payload?.data ?? null;
}

const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (path, params) => call('GET', `${path}${qs(params)}`),
  post: (path, body = {}) => call('POST', path, body),
  put: (path, body = {}) => call('PUT', path, body),
  patch: (path, body = {}) => call('PATCH', path, body),
  del: (path, body) => call('DELETE', path, body),
  upload: (path, formData) => call('POST', path, formData, { form: true }),
  /** Downloads a file and hands it to the browser. */
  async download(path, fallbackName = 'evidence') {
    const res = await call('GET', path, undefined, { raw: true });
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
