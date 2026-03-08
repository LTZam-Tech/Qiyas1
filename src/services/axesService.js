import { request } from '../lib/httpClient.js';
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
    try {
      const response = await request('/axes', { method: 'GET' }, { perspectiveId });
      const data = getResponseData(response);
      const axes = Array.isArray(data.axes) ? data.axes : [];
      return axes.map(normalizeAxis);
    } catch (error) {
      errorLogger.logWarning('Axes API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },
};

export default axesService;
