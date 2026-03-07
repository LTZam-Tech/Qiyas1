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
  if (requestInterceptors.length === 0) {
    return requestConfig;
  }

  const interceptorResults = await Promise.all(
    requestInterceptors.map((interceptor) => interceptor(requestConfig))
  );

  return interceptorResults.reduce((acc, patch) => {
    if (!patch || typeof patch !== 'object') {
      return acc;
    }

    return {
      ...acc,
      ...patch,
      options: {
        ...(acc.options || {}),
        ...(patch.options || {}),
        headers: {
          ...(acc.options?.headers || {}),
          ...(patch.options?.headers || {}),
        },
      },
    };
  }, requestConfig);
};

const applyResponseInterceptors = async (responseBody) => {
  if (responseInterceptors.length === 0) {
    return responseBody;
  }

  let nextBody = responseBody;
  const interceptorResults = await Promise.all(
    responseInterceptors.map((interceptor) => interceptor(responseBody))
  );

  for (const result of interceptorResults) {
    if (result !== undefined && result !== null) {
      nextBody = result;
    }
  }

  return nextBody;
};

const getSafeTimeoutMs = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
};

const getCsrfToken = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export async function request(path, options = {}, query = {}) {
  const { timeoutMs, headers: customHeaders = {}, ...restOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    getSafeTimeoutMs(timeoutMs ?? env.requestTimeoutMs)
  );

  try {
    const token = authTokenGetter?.();
    const method = (restOptions.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const csrfToken = isMutating ? getCsrfToken() : null;
    const config = await applyRequestInterceptors({
      url: createUrl(path, query),
      options: {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          ...customHeaders,
        },
        ...restOptions,
        signal: controller.signal,
      },
    });

    const response = await fetch(config.url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(config.options?.headers || {}),
      },
      ...(config.options || {}),
      signal: controller.signal,
    });

    const parsed = await parseResponse(response);
    
    return applyResponseInterceptors(parsed);
  } catch (error) {
    // Avoid storing sensitive payload/headers while still retaining request context.
    errorLogger.logBackendError(
      error.message || 'Request failed',
      {
        status: error.status,
        url: path,
        method: restOptions.method || 'GET',
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
