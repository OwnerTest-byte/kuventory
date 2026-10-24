/**
 * Session-scoped persistence for a submitted assisted-recovery ticket.
 *
 * Purpose: the login screen must keep showing the live "administrators are
 * reviewing your request" state across reloads and dialog reopens without
 * asking the user to retype anything.
 *
 * Security decisions:
 * - sessionStorage (not localStorage): the status credential is a secret; it
 *   must never be written to disk. It dies with the browser session and never
 *   leaves the tab that submitted the request.
 * - Every read validates the shape; corrupt or foreign data is discarded
 *   rather than trusted.
 * - This cache is a UX affordance only. The server remains the authority:
 *   every status display is driven by check_assisted_recovery_status with
 *   BOTH the reference and the credential, and closing/clearing this store
 *   never affects the real ticket or its cooldown.
 */

const STORAGE_KEY = 'kuventory_recovery_ticket';

export interface StoredRecoveryTicket {
  reference: string;
  credential: string;
  submittedAt: string;
}

export function saveRecoveryTicket(ticket: StoredRecoveryTicket): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!ticket.reference || !ticket.credential) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
  } catch {
    // Storage may be unavailable (private mode/quota); the workflow still
    // works — the user simply loses the reload-persistent banner.
  }
}

export function readRecoveryTicket(): StoredRecoveryTicket | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.reference === 'string' &&
      parsed.reference.trim().length > 0 &&
      typeof parsed.credential === 'string' &&
      parsed.credential.trim().length > 0
    ) {
      return {
        reference: parsed.reference,
        credential: parsed.credential,
        submittedAt: typeof parsed.submittedAt === 'string' ? parsed.submittedAt : new Date().toISOString(),
      };
    }
  } catch {
    // fall through: discard corrupt entries
  }
  clearRecoveryTicket();
  return null;
}

export function clearRecoveryTicket(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
