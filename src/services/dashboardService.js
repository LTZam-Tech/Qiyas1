import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

export async function getDashboardSummary() {
  try {
    const response = await request('/dashboard/summary', { method: 'GET' });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error('Dashboard API returned invalid structure');
  } catch (err) {
    errorLogger.logWarning('Dashboard API failed', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    throw err;
  }
}
