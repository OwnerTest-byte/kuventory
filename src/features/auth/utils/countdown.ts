/**
 * Server-authoritative countdown helpers.
 *
 * Both the assisted-recovery cooldown and the login lockout countdown are
 * derived from an authoritative expiry timestamp plus a server-time offset —
 * never from a locally decremented number. Browser timers pause in background
 * tabs and drift, so every displayed value is recomputed from the clock.
 */

export interface ServerClock {
  /** Milliseconds to ADD to Date.now() to obtain the server clock. */
  offsetMs: number;
}

/**
 * Derive the server-time offset from a server timestamp and the moment it was
 * (approximately) received. A fresh sample always replaces the previous
 * offset: server clock drift between samples is negligible next to transport
 * latency, and taking the latest authoritative sample keeps reconciliation
 * exact after sleep/wake or long background periods.
 */
export function deriveServerOffsetMs(
  serverNowIso: string | null | undefined,
  clientNowMs: number = Date.now()
): number | null {
  if (!serverNowIso) return null;
  const serverMs = Date.parse(serverNowIso);
  if (Number.isNaN(serverMs)) return null;
  return serverMs - clientNowMs;
}

/** Current server-adjusted time in milliseconds. */
export function serverAdjustedNow(clock: ServerClock | null, clientNowMs: number = Date.now()): number {
  const offset = clock ? clock.offsetMs : 0;
  return clientNowMs + (Number.isFinite(offset) ? offset : 0);
}

/**
 * Whole seconds remaining until expiry, rounded up so the label reaches 0
 * exactly when the deadline passes (never displays 0 early).
 */
export function computeRemainingSeconds(
  expiryIso: string | null | undefined,
  clock: ServerClock | null,
  clientNowMs: number = Date.now()
): number {
  if (!expiryIso) return 0;
  const expiryMs = Date.parse(expiryIso);
  if (Number.isNaN(expiryMs)) return 0;
  const remainingMs = expiryMs - serverAdjustedNow(clock, clientNowMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** Format whole seconds as a fixed MM:SS (or H:MM:SS beyond an hour) label. */
export function formatTimer(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  const two = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${two(mins)}:${two(rem)}` : `${two(mins)}:${two(rem)}`;
}

/** Human label like "1m 05s" for inline button/disabled-state text. */
export function formatRemainingLabel(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`;
  }
  return `${secs}s`;
}
