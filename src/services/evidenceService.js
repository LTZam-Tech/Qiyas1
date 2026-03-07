import { env } from '../config/env.js';
import { httpClient } from '../lib/httpClient.js';
import { STANDARDS_SAMPLE } from '../utils/data.js';
import errorLogger from './errorLogger.js';

export async function getEvidenceItems() {
  if (env.useMockApi) {
    return STANDARDS_SAMPLE;
  }

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
