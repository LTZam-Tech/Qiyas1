import { env } from '../config/env.js';
import { httpClient } from '../lib/httpClient.js';
import { STANDARDS_SAMPLE } from '../utils/data.js';

export async function getEvidenceItems() {
  if (env.useMockApi) {
    return STANDARDS_SAMPLE;
  }

  try {
    return await httpClient.get('/evidence');
  } catch (err) {
    console.warn('Evidence API failed, using mock data:', err);
    return STANDARDS_SAMPLE;
  }
}
