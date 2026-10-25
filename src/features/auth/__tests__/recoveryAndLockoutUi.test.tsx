// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LoginForm } from '../components/LoginForm';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

/** LoginForm uses React Query for public support contacts. */
function renderForm() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LoginForm />
    </QueryClientProvider>
  );
}
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
  // Enough microtask rounds for React Query's observer notifications to
  // settle (queryFn -> notifyManager -> observer -> React setState).
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      // React Query v5's notifyManager flushes observer batches via
      // setTimeout(0) — frozen under fake timers until the clock advances.
      vi.advanceTimersByTime(0);
    }
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

    renderForm();
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

    renderForm();
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

    renderForm();
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

    renderForm();
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

    renderForm();
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'staff@kuventory.com' } });
    await openRecoveryModal();
    await flush();

    expect(screen.getByText(/cooldown status could not be verified/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /cooldown unverified|submit recovery ticket|wait/i });
    expect(btn).toBeDisabled();
  });
});

describe('LoginForm login lockout behavior (component behavior)', () => {
  it('stage 1: the 5th failure starts a 30-minute cooldown — the rose card ticks down and self-releases on a confirmed EXPIRED', async () => {
    let released = false;
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
          escalation_required: false,
          server_now: iso(0),
        },
        error: null,
      }),
      check_lockout_status_by_token: async () => {
        if (released) {
          return { data: { status: 'EXPIRED', is_locked: false, was_unlocked: false, token_valid: true, server_now: iso(1_800_000) }, error: null };
        }
        return { data: null, error: { message: 'connection refused' } };
      },
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');

    // Rose cooldown card with the authoritative 30-minute countdown.
    expect(screen.getByText(/sign-in temporarily paused/i)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('30:00');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('29:59');

    // A failed status check must NOT clear the card.
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    await flush();
    expect(screen.getByText(/sign-in temporarily paused/i)).toBeInTheDocument();

    // Cooldown lapses: the poll confirms EXPIRED and the form self-releases.
    released = true;
    await act(async () => {
      vi.advanceTimersByTime(25 * 60_000);
    });
    await flush();

    expect(screen.queryByText(/sign-in temporarily paused/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sign In Form')).toBeInTheDocument();
    expect(screen.queryByText('Administrator Verification Required')).toBeNull();
  });

  it('stage 2: the 6th failure after the cooldown shows the administrator card with NO timer', async () => {
    mockRpc({
      check_account_lockout: async () => ({
        data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, server_now: iso(0) },
        error: null,
      }),
      record_failed_login_attempt: async () => ({
        data: {
          status: 'UNLOCKED',
          is_locked: false,
          failed_attempts: 1,
          locked_until: null,
          seconds_remaining: 0,
          escalation_required: true,
          server_now: iso(1_800_000),
          message: 'Administrator verification required. Contact an administrator through the official support channels to verify your identity.',
        },
        error: null,
      }),
    });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');

    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify with an administrator/i })).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/sign-in temporarily paused/i)).toBeNull();
  });

  it('the Verify with an Administrator button opens the contact pop-up (login card)', async () => {
    const { fetchPublicSupportContacts } = await import('@/features/admin/services/profileService');
    vi.mocked(fetchPublicSupportContacts).mockResolvedValue([
      {
        display_name: 'Admin One',
        job_title: 'Branch Administrator',
        support_phone: '09171234567',
        support_email: null,
        avatar_url: null,
        role: 'ADMIN',
        links: [],
      },
    ] as any);

    mockRpc({
      check_account_lockout: async () => ({
        data: {
          status: 'UNLOCKED',
          is_locked: false,
          failed_attempts: 0,
          escalation_required: true,
          server_now: iso(0),
        },
        error: null,
      }),
    });

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');

    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify with an administrator/i }));
    await flush();

    // The popup names the reason and shows where to contact (the dialog body).
    expect(screen.getByText(/must verify your identity before your access can be restored/i)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('09171234567');
  });

  it('the recovery contact-admin panel opens the same contact pop-up', async () => {
    const { fetchPublicSupportContacts } = await import('@/features/admin/services/profileService');
    vi.mocked(fetchPublicSupportContacts).mockResolvedValue([
      {
        display_name: 'Admin One',
        job_title: 'Branch Administrator',
        support_phone: '09170000000',
        support_email: null,
        avatar_url: null,
        role: 'ADMIN',
        links: [],
      },
    ] as any);

    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          escalation_required: true,
          server_now: iso(0),
          next_allowed_at: iso(3_600_000),
          seconds_remaining: 3600,
          message: 'Contact an administrator to verify your identity and confirm your correct login identifier.',
        },
        error: null,
      }),
    });

    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('ghost.user@kuventory.com');
    await flush();

    expect(screen.getAllByText('Contact an Administrator').length).toBeGreaterThan(0); // panel heading
    fireEvent.click(screen.getByRole('button', { name: /verify with an administrator/i }));
    await flush();

    // Popup content: identifier-context reason + the directory contact. The
    // recovery modal is also a dialog — pick the contact popup among them.
    const dialogs = screen.getAllByRole('dialog');
    const contactPopup = dialogs.find(d => d.textContent?.includes('09170000000'));
    expect(contactPopup).toBeTruthy();
    expect(contactPopup!.textContent).toContain('verify your identity and confirm your correct login identifier');
  });

  it('clears the verification card after a confirmed administrative unlock via token polling', async () => {
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
          locked_until: null,
          seconds_remaining: 0,
          lockout_token: 'opaque-token-3',
          escalation_required: false,
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

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();

    // ~10s bounded polling detects the administrator unlock without a refresh.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flush();

    expect(pollCount).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Administrator Verification Required/i)).not.toBeInTheDocument();
    expect(screen.getByText(/unlocked by an administrator/i)).toBeInTheDocument();
  });

  it('fails closed when the pre-login security check cannot be verified', async () => {
    mockRpc({
      check_account_lockout: async () => ({ data: null, error: { message: 'security service down' } }),
    });
    const signIn = vi.mocked(supabase.auth.signInWithPassword);

    renderForm();
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
    renderForm();
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
    renderForm();
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

describe('Recovery existence gate + truthful attempt messaging + conditional contacts (WS1/2/4)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('rejects an identifier that matches no account, with the server message and no ticket', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          account_exists: false,
          server_now: iso(0),
          message: 'No KUVENTORY account matches this identifier. Check the spelling or contact your administrator.',
        },
        error: null,
      }),
    });

    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('ghost.user@kuventory.com');
    await flush();

    expect(
      screen.getAllByRole('alert').some(a => a.textContent?.includes('No KUVENTORY account matches this identifier'))
    ).toBe(true);
    expect(screen.queryByText('Recovery Ticket Logged')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });

  it('counts down the wrong-identifier attempts toward the short cooldown without engaging it early', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          account_exists: false,
          attempts_remaining: 3,
          server_now: iso(0),
          message: 'No KUVENTORY account matches this identifier. Check the spelling or contact your administrator.',
        },
        error: null,
      }),
    });

    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('ghost.user@kuventory.com');
    await flush();

    const alert = screen
      .getAllByRole('alert')
      .find(a => a.textContent?.includes('No KUVENTORY account matches this identifier'));
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('3 attempts remaining before a short cooldown.');
    // Attempts 1-4 are honest rejections, not a cooldown: no wait label yet.
    expect(screen.queryByRole('button', { name: /Wait \d/ })).toBeNull();
  });

  it('starts a 2-minute cooldown — not a lockout — on the 5th wrong identifier, with the live button countdown', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          throttled: true,
          unknown_identifier_cooldown: true,
          server_now: iso(0),
          next_allowed_at: iso(120_000),
          seconds_remaining: 120,
          message: 'Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.',
        },
        error: null,
      }),
    });

    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('ghost.user@kuventory.com');
    await flush();

    const alert = screen
      .getAllByRole('alert')
      .find(a => a.textContent?.includes('Too many attempts with unknown identifiers'));
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain('You can submit again in 2m.');
    // The countdown label is derived from the authoritative expiry.
    expect(screen.getByRole('button', { name: 'Wait 02:00 to resubmit' })).toBeDisabled();
    // A cooldown is not a lockout: no lockout card heading appears.
    expect(screen.queryByRole('heading', { name: /lock/i })).toBeNull();
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });

  it('explains what belongs in the Check Ticket Status section', async () => {
    renderForm();
    await openRecoveryModal();

    expect(
      screen.getByText(
        /Enter the Request Reference and Status Credential shown when you submitted your recovery ticket/i
      )
    ).toBeInTheDocument();
  });

  it('shows the attempt count once, clears it on lockout, and requires administrator verification after a post-unlock failure', async () => {
    let phase: 'fail4' | 'lock' | 'unlocked' | 'post-unlock-fail' = 'fail4';
    mockRpc({
      check_account_lockout: async () => {
        if (phase === 'unlocked' || phase === 'post-unlock-fail') {
          return { data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, escalation_required: phase === 'post-unlock-fail', server_now: iso(300_000) }, error: null };
        }
        return { data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 0, server_now: iso(0) }, error: null };
      },
      record_failed_login_attempt: async () => {
        if (phase === 'fail4') {
          return { data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 4, server_now: iso(0) }, error: null };
        }
        if (phase === 'lock') {
          return {
            data: { status: 'LOCKED', is_locked: true, failed_attempts: 5, locked_until: null, seconds_remaining: 0, lockout_token: 'tok-ws2', escalation_required: false, server_now: iso(0) },
            error: null,
          };
        }
        // First failure AFTER the administrator lifted the lock: straight to
        // administrator verification — no fresh countdown cycle.
        return {
          data: {
            status: 'UNLOCKED',
            is_locked: false,
            failed_attempts: 1,
            escalation_required: true,
            server_now: iso(300_000),
            message: 'Administrator verification required. Contact an administrator through the official support channels to verify your identity.',
          },
          error: null,
        };
      },
      check_lockout_status_by_token: async () => ({
        data: { status: 'ADMIN_UNLOCKED', is_locked: false, was_unlocked: true, token_valid: true, server_now: iso(300_000) },
        error: null,
      }),
    });
    const signIn = vi.mocked(supabase.auth.signInWithPassword);
    signIn.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } } as any);

    renderForm();

    // 4th failure: plain error + single truthful sub-note.
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByText('Invalid email or password.')).toBeInTheDocument();
    expect(screen.getByText(/1 attempt remaining before the account locks automatically/i)).toBeInTheDocument();

    // 5th failure: verification card replaces the form — no stale note anywhere.
    phase = 'lock';
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();
    expect(screen.queryByText(/attempt(s)? remaining before the account locks automatically/i)).not.toBeInTheDocument();

    // The administrator verifies + unlocks: the poll clears the card cleanly.
    phase = 'unlocked';
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flush();
    expect(screen.getByText(/unlocked by an administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/attempt(s)? remaining before the account locks automatically/i)).not.toBeInTheDocument();

    // ONE more wrong password after the lift: no fresh "4 attempts" cycle —
    // straight back to administrator verification.
    phase = 'post-unlock-fail';
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();
    expect(screen.queryByText(/4 attempts remaining before the account locks automatically/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('renders each contact detail only when provided and hides the card when a contact has none', async () => {
    const { fetchPublicSupportContacts } = await import('@/features/admin/services/profileService');
    vi.mocked(fetchPublicSupportContacts).mockResolvedValue([
      {
        display_name: 'Admin One',
        job_title: 'Branch Administrator',
        support_phone: '09171234567',
        support_email: null,
        avatar_url: null,
        role: 'ADMIN',
        links: [{ id: 'l1', label: 'Facebook Page', platform: 'facebook', url: 'https://facebook.com/kuventory', sort_order: 1 }],
      },
      {
        display_name: 'Admin Two',
        job_title: 'System Administrator',
        support_phone: null,
        support_email: null,
        avatar_url: null,
        role: 'SUPER_ADMIN',
        links: [],
      },
    ] as any);

    mockRpc({});
    renderForm();
    await openRecoveryModal();
    await flush();

    // Admin One: phone row + link chip; no email row for them.
    expect(screen.getByText('09171234567')).toBeInTheDocument();
    expect(screen.getByText('Facebook Page')).toBeInTheDocument();
    expect(screen.queryByText(/Email:/i)).not.toBeInTheDocument();
    // Admin Two has no public method at all: the header shows, but their name
    // must NOT be listed as a contactable channel.
    expect(screen.queryByText(/Admin Two/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Admin One/i)).toBeInTheDocument();
  });

  it('hides the entire contacts card when no administrator provided any detail', async () => {
    const { fetchPublicSupportContacts } = await import('@/features/admin/services/profileService');
    vi.mocked(fetchPublicSupportContacts).mockResolvedValue([
      {
        display_name: 'Admin Three',
        job_title: 'Branch Administrator',
        support_phone: null,
        support_email: null,
        avatar_url: null,
        role: 'ADMIN',
        links: [],
      },
    ] as any);

    mockRpc({});
    renderForm();
    await openRecoveryModal();
    await flush();

    expect(screen.queryByText('Administrator Support')).not.toBeInTheDocument();
  });

  it('ticket panel uses the theme-aware palette (light base + dark variants)', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: true,
          throttled: false,
          request_reference: 'REF-20261025-THEME1',
          status_credential: 'ST-' + 'ef'.repeat(16),
          server_now: iso(0),
          next_allowed_at: iso(120_000),
          seconds_remaining: 120,
          message: 'received',
        },
        error: null,
      }),
    });
    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('staff@kuventory.com');

    const panel = document.querySelector('[class*="bg-emerald-50/70"]');
    expect(panel).toBeTruthy();
    expect(panel!.className).toContain('dark:bg-emerald-950/40');
    const referenceBlock = document.querySelector('[class*="bg-white/70"]');
    expect(referenceBlock).toBeTruthy();
    expect(referenceBlock!.className).toContain('dark:bg-black/50');
  });
});

describe('Login screen contact sync (Fix 4)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('refetches administrator contacts every time the recovery dialog opens', async () => {
    const { fetchPublicSupportContacts } = await import('@/features/admin/services/profileService');
    const spy = vi.mocked(fetchPublicSupportContacts).mockResolvedValue([]);
    mockRpc({});

    renderForm();
    await flush();
    const afterMount = spy.mock.calls.length;
    expect(afterMount).toBeGreaterThanOrEqual(1);

    // Close + reopen: fresh directory data each time.
    await openRecoveryModal();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    await flush();
    await openRecoveryModal();
    await flush();

    expect(spy.mock.calls.length).toBeGreaterThan(afterMount);
  });
});

describe('6th-attempt administrator verification (login + recovery escalation)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('replaces the sign-in form with the administrator-verification card — no password attempt is made', async () => {
    mockRpc({
      check_account_lockout: async () => ({
        data: {
          status: 'UNLOCKED',
          is_locked: false,
          failed_attempts: 0,
          escalation_required: true,
          server_now: iso(0),
        },
        error: null,
      }),
    });

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');

    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify with an administrator/i })).toBeInTheDocument();
    // The sign-in form is hidden while the verification state is active.
    expect(screen.queryByLabelText('Sign In Form')).toBeNull();
    // The pre-check short-circuits: Supabase Auth is never called.
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    // No lockout countdown is shown — escalation replaced the retry cycle.
    expect(screen.queryByText(/Sign-In Temporarily Paused/i)).toBeNull();
  });

  it('auto-syncs back to the sign-in form once the administrator clears the requirement', async () => {
    let escalated = true;
    mockRpc({
      check_account_lockout: async () => ({
        data: {
          status: 'UNLOCKED',
          is_locked: false,
          failed_attempts: 0,
          escalation_required: escalated,
          server_now: iso(0),
        },
        error: null,
      }),
    });

    renderForm();
    await submitLogin('staff@kuventory.com', 'wrongpass');
    expect(screen.getByText('Administrator Verification Required')).toBeInTheDocument();

    // The administrator verifies + unlocks; the next 10-second poll clears
    // the card automatically (no reload).
    escalated = false;
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await flush();

    expect(screen.getByLabelText('Sign In Form')).toBeInTheDocument();
    expect(screen.queryByText('Administrator Verification Required')).toBeNull();
  });

  it('replaces the identifier form with the contact-admin panel on the 6th wrong identifier', async () => {
    mockRpc({
      submit_assisted_recovery_request: async () => ({
        data: {
          accepted: false,
          escalation_required: true,
          server_now: iso(0),
          next_allowed_at: iso(3_600_000),
          seconds_remaining: 3600,
          message: 'Contact an administrator to verify your identity and confirm your correct login identifier.',
        },
        error: null,
      }),
    });

    renderForm();
    await openRecoveryModal();
    await fillAndSubmitRecovery('ghost.user@kuventory.com');
    await flush();

    expect(screen.getByText('Contact an Administrator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify with an administrator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    // The identifier form is hidden; the ticket tracker stays available.
    expect(screen.queryByLabelText(/account login identifier/i)).toBeNull();
    expect(screen.getByText('Check Ticket Status')).toBeInTheDocument();
    // Escalation created no ticket.
    expect(sessionStorage.getItem('kuventory_recovery_ticket')).toBeNull();
  });
});
