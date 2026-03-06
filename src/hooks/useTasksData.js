import { useEffect, useState } from 'react';
import { getTasks } from '../services/tasksService.js';

export default function useTasksData(filter) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      setIsLoading(true);
      setError('');
      try {
        const tasks = await getTasks(filter === 'all' ? {} : { status: filter });
        if (isMounted) {
          setData(tasks);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load tasks');
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
  }, [filter]);

  return { data, isLoading, error };
}
