const toBool = (value, fallback = false) => {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1',
  requestTimeoutMs: toNumber(import.meta.env.VITE_API_TIMEOUT_MS, 10000),
  useMockApi: toBool(import.meta.env.VITE_USE_MOCK_API, false),
};
