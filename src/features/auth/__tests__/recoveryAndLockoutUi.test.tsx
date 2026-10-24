// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LoginForm } from '../components/LoginForm';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(async () => ({ data: { user: null } })),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    sessionLeaseError: null,
    clearSessionLeaseError: vi.fn(),
    activateSession: vi.fn(),
  }),
}));

vi.mock('@/features/admin/services/profileService', () => ({
  fetchPublicSupportContacts: vi.fn(async () => []),
}));

vi.mock('../services/sessionLeaseService', () => ({
  claimSessionLease: vi.fn(async () => ({ success: true })),
  parseHumanDeviceInfo: (d?: string) => d || 'Another Browser/Device',
}));

const TEST_NOW = new Date('2026-10-25T12:00:00Z').getTime();
const iso = (msFromNow: number) => new Date(TEST_NOW + msFromNow).toISOString();

type RpcHandler = (args: any) => any;

function mockRpc(handlers: Record<string, RpcHandler>) {
  vi.mocked(supabase.rpc).mockImplementation((async (name: string, args: any) => {
    const handler = handlers[name];
    if (!handler) {
      return { data: null, error: { message: `no test handler for rpc ${name}` } };
    }
    return await handler(args);
  }) as any);
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

async function openRecoveryModal() {
  fireEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));
  await flush();
}

async function fillAndSubmitRecovery(email: string) {
  fireEvent.change(screen.getByLabelText(/account login identifier/i), {
    target: { value: email },
  });
  const form = screen.getByLabelText('Assisted Account Recovery Form');
  fireEvent.submit(form);
  await flush();
}

async function submitLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password$/), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText('Sign In Form'));
  await flush();
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(TEST_NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LoginForm assisted recovery workflow (component behavior)', () => {
  it('shows the reference AND one-time status credential with copy actions on success — never a fake email-reset message', async () => {
    (navigator as any).clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: true,
          throttled: false,
          request_reference: 'REF-20261025-A1B2C3',
          status_credential: 'ST-' + 'ab'.repeat(16),
          server_now: iso(0),
          next_allowed_at: iso(120_000),
          seconds_remaining: 120,
          message: 'Your recovery request has been received.',
        },
        error: null,
      }),
    });

    render(<LoginForm />);
    await openRecoveryModal();

    // The dialog explains the real workflow: no mailbox, admin-assisted only.
    expect(screen.getByText(/system addresses without mailboxes/i)).toBeInTheDocument();
    expect(screen.queryByText(/Email Reset/i)).not.toBeInTheDocument();

    await fillAndSubmitRecovery('staff@kuventory.com');

    expect(screen.getAllByText('REF-20261025-A1B2C3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ST-' + 'ab'.repeat(16)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Copy request reference' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy status credential' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy request reference' }));
    await flush();
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith('REF-20261025-A1B2C3');

    // Supabase email delivery is never invoked for these identifiers.
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('derives the cooldown from the authoritative expiry: label ticks down, button disabled, re-verified at zero', async () => {
    let cooldownChecks = 0;
    mockRpc({
      check_assisted_recovery_cooldown: async () => {
        cooldownChecks += 1;
        if (cooldownChecks <= 1) {
          return {
            data: {
              valid: true,
              can_submit: false,
              server_now: iso(0),
              next_allowed_at: iso(60_000),
              seconds_remaining: 60,
            },
            error: null,
          };
        }
        // After the local countdown reaches zero, the server confirms expiry.
        return { data: { valid: true, can_submit: true, server_now: iso(60_000), seconds_remaining: 0 }, error: null };
      },
    });

    render(<LoginForm />);
    // Pre-fill the login email so opening the dialog reconciles the cooldown.
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'staff@kuventory.com' } });
    await openRecoveryModal();

    const submitBtn = screen.getByRole('button', { name: /wait .* to resubmit|submit recovery ticket/i });
    expect(submitBtn).toHaveTextContent('Wait 01:00 to resubmit');
    expect(submitBtn).toBeDisabled();

    // Two seconds pass: the label must change because it is derived from the
    // expiry timestamp, not a local decrement that can drift.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: /wait .* to resubmit/i })).toHaveTextContent('Wait 00:58 to resubmit');

    // Countdown reaches zero: an authoritative re-check happens BEFORE the
    // button is re-enabled.
    await act(async () => {
      vi.advanceTimersByTime(58_000);
    });
    await flush();

    expect(cooldownChecks).toBeGreaterThanOrEqual(2);
    const enabled = screen.getByRole('button', { name: /submit recovery ticket/i });
    expect(enabled).toBeEnabled();
  });

  it('reconciles the server cooldown when the dialog is reopened (closing never resets it)', async () => {
    mockRpc({
      check_assisted_recovery_cooldown: async () => ({
        data: {
          valid: true,
          can_submit: false,
          // Live server response: anchored to a fixed expiry but always
          // reporting the server's current clock, like the real RPC.
          server_now: new Date().toISOString(),
          next_allowed_at: iso(45_000),
          seconds_remaining: 45,
        },
        error: null,
      }),
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'staff@kuventory.com' } });

    await openRecoveryModal();
    expect(screen.getByRole('button', { name: /wait .* to resubmit/i })).toHaveTextContent('Wait 00:45 to resubmit');

    // Close and reopen: the authoritative cooldown is fetched again and the
    // remaining time keeps shrinking rather than restarting.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    await flush();
    await openRecoveryModal();
    await flush();

    expect(screen.getByRole('button', { name: /wait .* to resubmit/i })).toHaveTextContent('Wait 00:30 to resubmit');
  });

  it('displays the authoritative remaining wait when the server throttles the submission', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          throttled: true,
          existing_request: true,
          server_now: iso(0),
          next_allowed_at: iso(95_000),
          seconds_remaining: 95,
          message: 'A recovery request for this identifier was recently submitted.',
        },
        error: null,
      }),
    });

    render(<LoginForm />);
    await openRecoveryModal();
    await fillAndSubmitRecovery('staff@kuventory.com');

    expect(screen.getByRole('alert')).toHaveTextContent(/recently submitted/i);
    const btn = screen.getByRole('button', { name: /wait .* to resubmit/i });
    expect(btn).toHaveTextContent('Wait 01:35 to resubmit');
    expect(btn).toBeDisabled();
    // No ticket was created: the credential card must not appear.
    expect(screen.queryByText(/recovery ticket logged/i)).not.toBeInTheDocument();
  });

  it('keeps submission blocked with a verification error when the cooldown check fails', async () => {
    mockRpc({
      check_assisted_recovery_cooldown: async () => ({ data: null, error: { message: 'db down' } }),
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'staff@kuventory.com' } });
    await openRecoveryModal();
    await flush();

    expect(screen.getByText(/cooldown status could not be verified/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /cooldown unverified|submit recovery ticket|wait/i });
    expect(btn).toBeDisabled();
  });
});

describe('LoginForm login lockout behavior (component behavior)', () => {
  it('locks on the 5th failure, ticks down live, re-checks the server at zero, and refuses to unlock on status failure', async () => {
    let tokenChecks = 0;
    mockRpc({
      check_account_lockout: async () => ({
        data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, server_now: iso(0) },
        error: null,
      }),
      record_failed_login_attempt: async () => ({
        data: {
          status: 'LOCKED',
          is_locked: true,
          failed_attempts: 5,
          locked_until: iso(1_800_000),
          seconds_remaining: 1800,
          lockout_token: 'opaque-token-1',
          server_now: iso(0),
        },
        error: null,
      }),
      check_lockout_status_by_token: async () => {
        tokenChecks += 1;
        // Server unreachable at the moment the local countdown hits zero.
        return { data: null, error: { message: 'connection refused' } };
      },
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    render(<LoginForm />);
    await submitLogin('staff@kuventory.com', 'wrongpass');

    // Locked card with the authoritative 30-minute value.
    expect(screen.getByText(/sign-in temporarily paused/i)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('30:00');

    // The visible countdown actually decreases over time.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('29:59');
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('29:00');

    // Countdown reaches zero: an authoritative check runs; because the server
    // cannot be reached the UI must NOT claim the account is unlocked.
    await act(async () => {
      vi.advanceTimersByTime(29 * 60_000);
    });
    await flush();

    expect(tokenChecks).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/sign-in temporarily paused/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not verify your lockout status/i);
  });

  it('leaves the locked state only after the server confirms expiry', async () => {
    let tokenChecks = 0;
    mockRpc({
      check_account_lockout: async () => ({
        data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, server_now: iso(0) },
        error: null,
      }),
      record_failed_login_attempt: async () => ({
        data: {
          status: 'LOCKED',
          is_locked: true,
          failed_attempts: 5,
          locked_until: iso(300_000),
          seconds_remaining: 300,
          lockout_token: 'opaque-token-2',
          server_now: iso(0),
        },
        error: null,
      }),
      check_lockout_status_by_token: async () => {
        tokenChecks += 1;
        return { data: { status: 'EXPIRED', is_locked: false, token_valid: true, server_now: iso(300_000) }, error: null };
      },
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    render(<LoginForm />);
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');

    // Local countdown hits zero -> authoritative check confirms expiry.
    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });
    await flush();

    expect(tokenChecks).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/sign-in temporarily paused/i)).not.toBeInTheDocument();
    expect(screen.getByText(/lockout period has ended/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Sign In Form')).toBeInTheDocument();
  });

  it('clears the locked UI after a confirmed early administrative unlock via token polling', async () => {
    let pollCount = 0;
    mockRpc({
      check_account_lockout: async () => ({
        data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, server_now: iso(0) },
        error: null,
      }),
      record_failed_login_attempt: async () => ({
        data: {
          status: 'LOCKED',
          is_locked: true,
          failed_attempts: 5,
          locked_until: iso(1_800_000),
          seconds_remaining: 1800,
          lockout_token: 'opaque-token-3',
          server_now: iso(0),
        },
        error: null,
      }),
      check_lockout_status_by_token: async () => {
        pollCount += 1;
        return { data: { status: 'ADMIN_UNLOCKED', is_locked: false, was_unlocked: true, server_now: iso(20_000) }, error: null };
      },
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    render(<LoginForm />);
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByRole('timer')).toHaveTextContent('30:00');

    // ~10s bounded polling detects the administrator unlock without a refresh.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flush();

    expect(pollCount).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/sign-in temporarily paused/i)).not.toBeInTheDocument();
    expect(screen.getByText(/lifted by an administrator/i)).toBeInTheDocument();
  });

  it('fails closed when the pre-login security check cannot be verified', async () => {
    mockRpc({
      check_account_lockout: async () => ({ data: null, error: { message: 'security service down' } }),
    });
    const signIn = vi.mocked(supabase.auth.signInWithPassword);

    render(<LoginForm />);
    await submitLogin('staff@kuventory.com', 'anypassword123');

    expect(screen.getByText(/could not verify your account security status/i)).toBeInTheDocument();
    // Credentials are never submitted when the security state is unknown.
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('LoginForm pending-review card (live admin-review status)', () => {
  const ACCEPTED_RESPONSE = () => ({
    data: {
      accepted: true,
      throttled: false,
      request_reference: 'REF-20261025-PENDING1',
      status_credential: 'ST-' + 'cd'.repeat(16),
      server_now: iso(0),
      next_allowed_at: iso(120_000),
      seconds_remaining: 120,
      message: 'Your recovery request has been received.',
    },
    error: null,
  });

  beforeEach(() => {
    sessionStorage.clear();
  });

  async function submitTicket(handlers: Record<string, RpcHandler>) {
    mockRpc(handlers);
    render(<LoginForm />);
    await openRecoveryModal();
    await fillAndSubmitRecovery('staff@kuventory.com');
  }

  it('shows the animated "administrators are reviewing" card after submission and persists the ticket', async () => {
    await submitTicket({
      submit_assisted_recovery_request: ACCEPTED_RESPONSE,
      check_assisted_recovery_status: async () => ({
        data: { valid: true, status: 'RECEIVED', submitted_at: iso(0) },
        error: null,
      }),
    });

    expect(screen.getByText(/Administrators are reviewing your recovery request/i)).toBeInTheDocument();
    expect(screen.getAllByText('REF-20261025-PENDING1').length).toBeGreaterThan(0);

    const stored = sessionStorage.getItem('kuventory_recovery_ticket');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).reference).toBe('REF-20261025-PENDING1');
    // The credential lives in session storage only — never localStorage.
    expect(localStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });

  it('restores the pending card after a full page reload (remount) and re-verifies with the server', async () => {
    let statusChecks = 0;
    await submitTicket({
      submit_assisted_recovery_request: ACCEPTED_RESPONSE,
      check_assisted_recovery_status: async () => {
        statusChecks += 1;
        return { data: { valid: true, status: 'HUMAN_REVIEW', submitted_at: iso(0) }, error: null };
      },
    });
    expect(screen.getByText(/Administrators are reviewing/i)).toBeInTheDocument();

    // Simulate a reload: full unmount + remount with the same session storage.
    cleanup();
    render(<LoginForm />);
    await flush();

    expect(screen.getByText(/Administrators are reviewing/i)).toBeInTheDocument();
    expect(screen.getAllByText('REF-20261025-PENDING1').length).toBeGreaterThan(0);
    expect(statusChecks).toBeGreaterThanOrEqual(1);
  });

  it('transitions to the completed outcome, clears persisted state, and invites the new-password sign-in', async () => {
    let statusChecks = 0;
    await submitTicket({
      submit_assisted_recovery_request: ACCEPTED_RESPONSE,
      check_assisted_recovery_status: async () => {
        statusChecks += 1;
        if (statusChecks === 1) {
          return { data: { valid: true, status: 'RECEIVED', submitted_at: iso(0) }, error: null };
        }
        return {
          data: {
            valid: true,
            status: 'COMPLETED',
            submitted_at: iso(0),
            resolved_at: iso(10_000),
            decision_reason: 'Identity verified by administrator; password reset completed.',
          },
          error: null,
        };
      },
    });

    // Bounded 20s poll: two cycles — the first re-verifies RECEIVED, the
    // second observes the administrator's decision.
    await act(async () => {
      vi.advanceTimersByTime(40_000);
    });
    await flush();

    expect(screen.getByText(/Your password was reset by an administrator/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in below with the new password/i)).toBeInTheDocument();
    expect(screen.queryByText(/Administrators are reviewing/i)).not.toBeInTheDocument();
    // Outcome decided: persistence cleared so the card does not survive reload.
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });

  it('keeps the pending card with an honest retry note when the status check fails (no fake outcome)', async () => {
    await submitTicket({
      submit_assisted_recovery_request: ACCEPTED_RESPONSE,
      check_assisted_recovery_status: async () => ({ data: null, error: { message: 'offline' } }),
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await flush();

    expect(screen.getByText(/Administrators are reviewing/i)).toBeInTheDocument();
    expect(screen.getByText(/Status check unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/password was reset/i)).not.toBeInTheDocument();
    // Unknown status never clears the persisted ticket.
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeTruthy();
  });

  it('silently stops tracking an invalid reference/credential pair', async () => {
    await submitTicket({
      submit_assisted_recovery_request: ACCEPTED_RESPONSE,
      check_assisted_recovery_status: async () => ({
        data: { valid: false, message: 'Invalid request reference or status credential.' },
        error: null,
      }),
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await flush();

    expect(screen.queryByText(/Administrators are reviewing/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });
});
