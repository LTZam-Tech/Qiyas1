import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { AXES } from '../utils/data.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizeAxis = (axis) => {
  const nameAr = axis?.name_ar || axis?.nameAr || axis?.name || '';
  const nameEn = axis?.name_en || axis?.nameEn || axis?.name || '';
  const perspectiveId = axis?.perspective_id || axis?.perspectiveId || axis?.perspId || '';

  return {
    ...axis,
    name_ar: nameAr,
    name_en: nameEn,
    nameAr,
    nameEn,
    perspective_id: String(perspectiveId),
    perspectiveId: String(perspectiveId),
  };
};

const axesService = {
  async getAxes(perspectiveId) {
    const localFallback = AXES
      .filter((axis) => String(axis.perspId) === String(perspectiveId))
      .map((axis) => normalizeAxis({
        id: String(axis.id),
        code: axis.code,
        name_ar: axis.name,
        name_en: axis.nameEn,
        perspective_id: String(axis.perspId),
      }));

    if (env.useMockApi) {
      return localFallback;
    }

    try {
      const response = await request('/axes', { method: 'GET' }, { perspectiveId });
      const data = getResponseData(response);
      const axes = Array.isArray(data.axes) ? data.axes : [];
      return axes.length > 0 ? axes.map(normalizeAxis) : localFallback;
    } catch (error) {
      errorLogger.logWarning('Axes API failed, using local fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return localFallback;
    }
  },
};

export default axesService;
