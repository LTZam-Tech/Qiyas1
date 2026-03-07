import { request } from '../lib/httpClient.js';
import { AXES, PERSPECTIVES, RECENT_ACTIVITIES, STANDARDS_HIERARCHY } from '../utils/data.js';
import { calculateHierarchyWeights } from '../utils/complianceWeights.js';

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
    
    console.warn('Invalid response structure, using mock data');
    return getMockDashboard();
  } catch (err) {
    console.warn('Dashboard API failed, using mock data:', err);
    return getMockDashboard();
  }
}
