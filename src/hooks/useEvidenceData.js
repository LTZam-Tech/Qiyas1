import { useEffect, useState } from 'react';
import { getEvidenceItems } from '../services/evidenceService.js';

export default function useEvidenceData() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const evidence = await getEvidenceItems();
        if (isMounted) {
          setData(evidence);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load evidence');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, []);

  return { data, isLoading, error };
}
