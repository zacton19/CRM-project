import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

type QueryState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Runs `fn` whenever the screen gains focus (and whenever `fn` changes), so data
 * stays fresh after edits on other screens. Wrap `fn` in useCallback.
 */
export function useFocusQuery<T>(fn: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, error, loading, reload };
}
