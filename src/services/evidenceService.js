import { httpClient } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

export async function getEvidenceItems() {
  try {
    const res = await httpClient.get('/submissions/files');
    // Map backend evidence file metadata to frontend card structure
    const files = res.data?.files || [];
    // Group by standard code, aggregate approved/reqCount, and map metadata
    const grouped = {};
    for (const file of files) {
      // Use standard code as the grouping key
      const code = file.standard_code || file.standard || file.code || file.standard_title_en || file.standard_title || file.original_filename;
      if (!grouped[code]) {
        grouped[code] = {
          code,
          title: file.standard_title || file.domain_title || file.original_filename,
          titleEn: file.standard_title_en || file.domain_title_en || file.original_filename,
          status: file.status || 'non',
          reqCount: 1,
          approved: file.status === 'approved' ? 1 : 0,
        };
      } else {
        grouped[code].reqCount += 1;
        if (file.status === 'approved') grouped[code].approved += 1;
      }
    }
    // Convert to array and fill missing fields
    return Object.values(grouped).map(item => ({
      ...item,
      reqCount: item.reqCount || 1,
      approved: item.approved || 0,
      status: item.status || 'non',
      title: item.title || item.code,
      titleEn: item.titleEn || item.code,
    }));
  } catch (err) {
    errorLogger.logWarning('Evidence API failed in live mode', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    throw err;
  }
}

// Raw file rows (one per uploaded file) for the Files ledger.
export async function getEvidenceFiles() {
  try {
    const res = await httpClient.get('/submissions/files');
    return Array.isArray(res.data?.files) ? res.data.files : [];
  } catch (err) {
    errorLogger.logWarning('Evidence files API failed', 'backend', {
      message: err?.message,
      status: err?.status,
    });
    throw err;
  }
}

export async function downloadEvidenceFile(submissionId, fileId) {
  try {
    const res = await httpClient.get(`/submissions/${submissionId}/files/${fileId}/download`);
    if (res.data?.downloadUrl) {
      // Redirect browser to download the file directly from MinIO pre-signed URL
      const a = document.createElement('a');
      a.href = res.data.downloadUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
    throw new Error('No download URL returned');
  } catch (err) {
    errorLogger.logFrontendError('Download Evidence Failed', { error: err });
    throw err;
  }
}
