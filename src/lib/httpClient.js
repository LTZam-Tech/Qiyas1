import { env } from '../config/env.js';
import errorLogger from '../services/errorLogger.js';

let authTokenGetter = null;
let unauthorizedHandler = null;

const requestInterceptors = [];
const responseInterceptors = [];

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

const applyRequestInterceptors = async (requestConfig) => {
  let nextConfig = requestConfig;
  for (const interceptor of requestInterceptors) {
    nextConfig = (await interceptor(nextConfig)) || nextConfig;
  }
  return nextConfig;
};

const applyResponseInterceptors = async (responseBody) => {
  let nextBody = responseBody;
  for (const interceptor of responseInterceptors) {
    nextBody = (await interceptor(nextBody)) ?? nextBody;
  }
  return nextBody;
};

export async function request(path, options = {}, query = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), env.requestTimeoutMs);

  try {
    const token = authTokenGetter?.();
    const config = await applyRequestInterceptors({
      url: createUrl(path, query),
      options: {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
        ...options,
        signal: controller.signal,
      },
    });

    console.group(`📤 HTTP ${options.method || 'GET'} ${path}`);
    console.log('Full URL:', config.url);
    console.log('API Base:', env.apiBaseUrl);
    console.log('Headers:', config.options.headers);
    console.log('Body:', options.body || 'none');
    console.log('Timeout:', env.requestTimeoutMs, 'ms');

    const response = await fetch(config.url, {
      headers: {
        'Content-Type': 'application/json',
        ...(config.options?.headers || {}),
      },
      ...(config.options || {}),
      signal: controller.signal,
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
    console.log('Response Headers:', {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });
    console.log('Response OK:', response.ok);

    const parsed = await parseResponse(response);
    console.log('✅ Parsed Response:', parsed);
    console.groupEnd();
    
    return applyResponseInterceptors(parsed);
  } catch (error) {
    console.error('❌ Request Failed');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Status:', error.status);
    console.error('Error Body:', error.body);
    console.groupEnd();
    
    // Log to error logger
    errorLogger.logBackendError(
      error.message || 'Request failed',
      {
        status: error.status,
        url: path,
        method: options.method || 'GET',
        body: error.body,
      }
    );
    
    if (error?.status === 401 && unauthorizedHandler) {
      unauthorizedHandler(error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setAuthTokenGetter(getter) {
  authTokenGetter = typeof getter === 'function' ? getter : null;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

export function addRequestInterceptor(interceptor) {
  if (typeof interceptor !== 'function') {
    return () => {};
  }

  requestInterceptors.push(interceptor);
  return () => {
    const index = requestInterceptors.indexOf(interceptor);
    if (index >= 0) {
      requestInterceptors.splice(index, 1);
    }
  };
}

export function addResponseInterceptor(interceptor) {
  if (typeof interceptor !== 'function') {
    return () => {};
  }

  responseInterceptors.push(interceptor);
  return () => {
    const index = responseInterceptors.indexOf(interceptor);
    if (index >= 0) {
      responseInterceptors.splice(index, 1);
    }
  };
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
