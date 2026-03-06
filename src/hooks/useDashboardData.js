import { useEffect, useState } from 'react';
import { getDashboardSummary } from '../services/dashboardService.js';

export default function useDashboardData() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const summary = await getDashboardSummary();
        if (isMounted) {
          setData(summary);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load dashboard');
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
