import { request } from '../lib/httpClient.js';
import { PERSPECTIVES, RECENT_ACTIVITIES } from '../utils/data.js';

const getMockDashboard = () => ({
  kpis: {
    totalStandards: 95,
    fullCompliance: 55,
    partialCompliance: 27,
    nonCompliance: 13,
  },
  perspectives: PERSPECTIVES,
  activities: RECENT_ACTIVITIES,
  alerts: [
    '4 standards remain non-compliant with no evidence uploaded yet.',
    '12 tasks are overdue their due date.',
    'Average review cycle time is 4.2 days.',
  ],
});

export async function getDashboardSummary() {
  try {
    const response = await request('/dashboard/summary', { method: 'GET' });
    
    if (response.success && response.data) {
      return response.data;
    }
    
    console.warn('Invalid response structure, using mock data');
    return getMockDashboard();
  } catch (err) {
    console.warn('Dashboard API failed, using mock data:', err);
    return getMockDashboard();
  }
}
