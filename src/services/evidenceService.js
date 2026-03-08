import { httpClient } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

export async function getEvidenceItems() {
  try {
    return await httpClient.get('/evidence');
  } catch (err) {
    errorLogger.logWarning('Evidence API failed in live mode', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    throw err;
  }
}
