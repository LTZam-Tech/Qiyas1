import { env } from '../config/env.js';

const createUrl = (path, query = {}) => {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson ? body?.message || 'Request failed' : 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
};

export async function request(path, options = {}, query = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), env.requestTimeoutMs);

  try {
    const response = await fetch(createUrl(path, query), {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
      signal: controller.signal,
    });

    return await parseResponse(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const httpClient = {
  get: (path, query) => request(path, { method: 'GET' }, query),
  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  put: (path, body) =>
    request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  del: (path) => request(path, { method: 'DELETE' }),
};
