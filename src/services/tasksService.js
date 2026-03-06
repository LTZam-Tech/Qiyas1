import { env } from '../config/env.js';
import { httpClient } from '../lib/httpClient.js';
import { TASKS_DATA } from '../utils/data.js';

export async function getTasks(filter = {}) {
  if (env.useMockApi) {
    const status = filter.status;
    if (!status || status === 'all') {
      return TASKS_DATA;
    }
    return TASKS_DATA.filter((task) => task.status === status);
  }

  try {
    return await httpClient.get('/tasks', filter);
  } catch (err) {
    console.warn('Tasks API failed, using mock data:', err);
    const status = filter.status;
    if (!status || status === 'all') {
      return TASKS_DATA;
    }
    return TASKS_DATA.filter((task) => task.status === status);
  }
}
