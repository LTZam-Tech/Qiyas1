import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { STANDARDS_HIERARCHY } from '../utils/data.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizeStandard = (standard) => {
  const title = standard?.title || standard?.name || standard?.name_ar || '';
  const axisId = standard?.axis_id || standard?.axisId || '';

  return {
    ...standard,
    title,
    name: standard?.name || title,
    name_ar: standard?.name_ar || title,
    name_en: standard?.name_en || standard?.name || title,
    axis_id: String(axisId),
    axisId: String(axisId),
  };
};

const resolveStandardFromMock = (standardId) => {
  const byId = STANDARDS_HIERARCHY.find((std) => String(std.id) === String(standardId));
  if (byId) return byId;

  const byCode = STANDARDS_HIERARCHY.find((std) => String(std.code) === String(standardId));
  if (byCode) return byCode;

  const numeric = Number(standardId);
  if (Number.isInteger(numeric) && numeric > 0) {
    return STANDARDS_HIERARCHY[numeric - 1] || null;
  }

  const match = String(standardId).match(/(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 ? STANDARDS_HIERARCHY[index] || null : null;
};

const standardsService = {
  // Get all standards
  async getStandards(axisId) {
    const localFallback = STANDARDS_HIERARCHY
      .filter((std) => !axisId || String(std.axisId) === String(axisId))
      .map((std, idx) => normalizeStandard({
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

    if (env.useMockApi) {
      return localFallback;
    }

    try {
      const url = axisId ? `/standards?axisId=${axisId}` : '/standards';
      const response = await request(url);
      const data = getResponseData(response);
      const standards = Array.isArray(data.standards) ? data.standards : [];
      return standards.length > 0 ? standards.map(normalizeStandard) : localFallback;
    } catch (error) {
      errorLogger.logWarning('Standards API failed, using local fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return localFallback;
    }
  },

  // Get standard by ID with evidence requirements
  async getStandardById(standardId) {
    if (env.useMockApi) {
      const std = resolveStandardFromMock(standardId);
      if (!std) return null;

      return normalizeStandard({
        id: String(standardId),
        code: std.code,
        name: std.name || std.title,
        evidence_requirements: [
          { id: `${standardId}-er-1`, title: `${std.name || std.title} - متطلب الشاهد 1`, description: 'وصف المتطلب' },
          { id: `${standardId}-er-2`, title: `${std.name || std.title} - متطلب الشاهد 2`, description: 'وصف المتطلب' },
          { id: `${standardId}-er-3`, title: `${std.name || std.title} - متطلب الشاهد 3`, description: 'وصف المتطلب' },
        ],
      });
    }
    
    const response = await request(`/standards/${standardId}`);
    const data = getResponseData(response);
    return data.standard ? normalizeStandard(data.standard) : null;
  },
};

export default standardsService;
