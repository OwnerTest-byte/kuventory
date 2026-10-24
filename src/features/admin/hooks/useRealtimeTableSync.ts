import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Realtime synchronization for private administrator queues.
 *
 * Subscribes to row changes on a realtime-published table and triggers the
 * caller's reload. Delivery is filtered by RLS on the server: only sessions
 * that satisfy the table's SELECT policy ever receive events, so no data is
 * broadcast beyond authorized administrators.
 *
 * This is an accelerator, never the authority: callers keep their bounded
 * polling fallback, and every payload triggers a refetch whose RESPONSE is
 * the trusted state.
 *
 * @returns isLive — true while the subscription is confirmed SUBSCRIBED.
 */
export function useRealtimeTableSync(options: {
  table: string;
  channelName: string;
  onEvent: () => void;
  enabled?: boolean;
}): { isLive: boolean } {
  const { table, channelName, onEvent, enabled = true } = options;
  const [isLive, setIsLive] = useState(false);
  // Keep the latest callback without resubscribing on every render.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      setIsLive(false);
      return;
    }

    let removed = false;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          if (!removed) onEventRef.current();
        }
      )
      .subscribe((status: string) => {
        if (removed) return;
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      removed = true;
      setIsLive(false);
      supabase.removeChannel(channel);
    };
  }, [table, channelName, enabled]);

  return { isLive };
}
