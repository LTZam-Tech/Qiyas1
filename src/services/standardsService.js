import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { STANDARDS_HIERARCHY } from '../utils/data.js';

const standardsService = {
  // Get all standards
  async getStandards(axisId) {
        if (env.useMockApi) {
          // Return mock data
          return STANDARDS_HIERARCHY
            .filter((std) => !axisId || String(std.axisId) === String(axisId))
            .map((std, idx) => ({
            id: `std-${idx + 1}`,
            code: std.code,
            title: std.title,
            name_ar: std.title,
            axis_id: String(std.axisId || 'axis-1'),
            evidence_requirements: [
              { id: `er-${idx + 1}-1`, title: `${std.title} - متطلب 1` },
              { id: `er-${idx + 1}-2`, title: `${std.title} - متطلب 2` },
            ],
          }));
        }
    
    const url = axisId ? `/standards?axisId=${axisId}` : '/standards';
    const response = await request(url);
    return response.data?.standards || [];
  },

  // Get standard by ID with evidence requirements
  async getStandardById(standardId) {
        if (env.useMockApi) {
          const idx = parseInt(standardId.split('-')[1]) - 1;
          const std = STANDARDS_HIERARCHY[idx];
          if (!std) return null;
      
          return {
            id: standardId,
            code: std.code,
            name: std.name,
            evidence_requirements: [
              { id: `${standardId}-er-1`, title: `${std.name} - متطلب الشاهد 1`, description: 'وصف المتطلب' },
              { id: `${standardId}-er-2`, title: `${std.name} - متطلب الشاهد 2`, description: 'وصف المتطلب' },
              { id: `${standardId}-er-3`, title: `${std.name} - متطلب الشاهد 3`, description: 'وصف المتطلب' },
            ],
          };
        }
    
    const response = await request(`/standards/${standardId}`);
    return response.data?.standard;
  },
};

export default standardsService;
