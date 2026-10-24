// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeTableSync } from '../useRealtimeTableSync';
import { supabase } from '@/lib/supabase';

type Handler = (payload: any) => void;
type StatusHandler = (status: string) => void;

interface ChannelMock {
  on: (kind: string, cfg: any, cb: Handler) => ChannelMock;
  subscribe: (cb?: StatusHandler) => ChannelMock;
  __emitEvent: (payload: any) => void;
  __emitStatus: (status: string) => void;
}

function makeChannelMock(): { channel: ChannelMock } {
  const handlers: { event: Handler[]; status: StatusHandler[] } = { event: [], status: [] };
  const channel: ChannelMock = {
    on: vi.fn((_kind: string, _cfg: any, cb: Handler) => {
      handlers.event.push(cb);
      return channel;
    }),
    subscribe: vi.fn((cb?: StatusHandler) => {
      if (cb) handlers.status.push(cb);
      return channel;
    }),
    __emitEvent: (payload: any) => handlers.event.forEach(h => h(payload)),
    __emitStatus: (status: string) => handlers.status.forEach(h => h(status)),
  };
  return { channel };
}

vi.mock('@/lib/supabase', () => {
  const removeChannel = vi.fn();
  return {
    supabase: {
      channel: vi.fn(),
      removeChannel,
      __removeChannel: removeChannel,
    },
  };
});

describe('useRealtimeTableSync — realtime acceleration for admin queues', () => {
  let channelMock: ReturnType<typeof makeChannelMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    channelMock = makeChannelMock();
    vi.mocked(supabase.channel).mockReturnValue(channelMock.channel as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to the configured table and fires the reload on row events', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeTableSync({ table: 'account_recovery_requests', channelName: 'test-ch', onEvent })
    );

    expect(supabase.channel).toHaveBeenCalledWith('test-ch');
    expect(channelMock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'account_recovery_requests' },
      expect.any(Function)
    );
    expect(result.current.isLive).toBe(false);

    act(() => { channelMock.channel.__emitStatus('SUBSCRIBED'); });
    expect(result.current.isLive).toBe(true);

    act(() => { channelMock.channel.__emitEvent({ new: { id: 'row-1' } }); });
    act(() => { channelMock.channel.__emitEvent({ eventType: 'UPDATE', old: { id: 'row-1' } }); });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('reports not-live on channel errors and dropped connections (polling fallback continues)', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeTableSync({ table: 't', channelName: 'ch', onEvent })
    );

    act(() => { channelMock.channel.__emitStatus('SUBSCRIBED'); });
    expect(result.current.isLive).toBe(true);

    act(() => { channelMock.channel.__emitStatus('CHANNEL_ERROR'); });
    expect(result.current.isLive).toBe(false);

    act(() => { channelMock.channel.__emitStatus('SUBSCRIBED'); });
    act(() => { channelMock.channel.__emitStatus('CLOSED'); });
    expect(result.current.isLive).toBe(false);
  });

  it('never subscribes when disabled and cleans up on unmount', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(({ enabled }) =>
      useRealtimeTableSync({ table: 't', channelName: 'ch', onEvent, enabled })
    , { initialProps: { enabled: false } });

    expect(supabase.channel).not.toHaveBeenCalled();

    unmount();
    // Enabled runs also remove their channel on unmount.
    expect((supabase as any).__removeChannel).not.toHaveBeenCalled();
  });

  it('removes the channel on unmount so no stale subscription leaks', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() =>
      useRealtimeTableSync({ table: 't', channelName: 'ch', onEvent })
    );
    unmount();
    expect((supabase as any).__removeChannel).toHaveBeenCalledWith(channelMock.channel);
  });

  it('does not fire after unmount (stale events are ignored)', () => {
    const onEvent = vi.fn();
    const { unmount } = renderHook(() =>
      useRealtimeTableSync({ table: 't', channelName: 'ch', onEvent })
    );
    unmount();
    act(() => { channelMock.channel.__emitEvent({ new: {} }); });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
