import { httpClient } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';
import { getAccessToken } from '../lib/authStorage.js';

export async function getEvidenceItems() {
  try {
    const res = await httpClient.get('/submissions/files');
    return res.data?.files || [];
  } catch (err) {
    errorLogger.logWarning('Evidence API failed in live mode', 'backend', {
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
