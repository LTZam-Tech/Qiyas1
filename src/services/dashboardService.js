import { request } from '../lib/httpClient.js';
import { AXES, PERSPECTIVES, RECENT_ACTIVITIES, STANDARDS_HIERARCHY } from '../utils/data.js';
import { calculateHierarchyWeights } from '../utils/complianceWeights.js';
import errorLogger from './errorLogger.js';

const getMockDashboard = () => {
  const hierarchy = calculateHierarchyWeights({
    perspectives: PERSPECTIVES,
    axes: AXES,
    standards: STANDARDS_HIERARCHY,
  });

  return {
    kpis: hierarchy.kpis,
    perspectives: hierarchy.perspectives,
    activities: RECENT_ACTIVITIES,
    alerts: [
      '4 standards remain non-compliant with no evidence uploaded yet.',
      '12 tasks are overdue their due date.',
      'Average review cycle time is 4.2 days.',
    ],
  };
};

export async function getDashboardSummary() {
  try {
    const response = await request('/dashboard/summary', { method: 'GET' });
    
    if (response.success && response.data) {
      return response.data;
    }

    errorLogger.logWarning('Dashboard API returned invalid structure, using mock data', 'backend');
    return getMockDashboard();
  } catch (err) {
    errorLogger.logWarning('Dashboard API failed, using mock data fallback', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    return getMockDashboard();
  }
}
