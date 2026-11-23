import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh for live lists: bumps a key (use it in the subscription's effect deps
 * so the list re-subscribes) and shows the spinner briefly.
 */
export function useRefresh() {
  const [key, setKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 700);
  }, []);
  return { key, refreshing, onRefresh };
}
