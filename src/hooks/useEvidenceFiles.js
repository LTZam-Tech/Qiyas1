import { useCallback, useEffect, useState } from 'react';
import { getEvidenceFiles } from '../services/evidenceService.js';

// One row per uploaded file (the Evidence Locker hook groups files by standard instead).
export default function useEvidenceFiles() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => {
    setIsLoading(true);
    setError('');
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    getEvidenceFiles()
      .then((files) => isMounted && setData(files))
      .catch((err) => isMounted && setError(err.message || 'Failed to load files'))
      .finally(() => isMounted && setIsLoading(false));
    return () => {
      isMounted = false;
    };
  }, [tick]);

  return { data, isLoading, error, reload };
}
