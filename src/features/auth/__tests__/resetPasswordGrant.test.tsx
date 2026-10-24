// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(async () => ({})),
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>
  );
}

describe('ResetPasswordPage recovery-grant detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('accepts the recovery hash as a valid grant and enables the form', async () => {
    window.location.hash = '#/reset-password?type=recovery&access_token=abc';
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any);

    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText(/Reset Link Expired or Invalid/i)).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /update password/i });
    expect(submit).toBeDisabled(); // disabled only until fields are filled
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText(/confirm new password/i), { target: { value: 'NewPass1234' } });
    expect(screen.getByRole('button', { name: /update password/i })).toBeEnabled();
  });

  it('accepts an existing session as a grant (hash may have been consumed)', async () => {
    window.location.hash = '';
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'x', user: { id: 'u1' } } },
    } as any);

    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText(/Reset Link Expired or Invalid/i)).not.toBeInTheDocument();
  });

  it('shows the honest invalid state (with the assisted-recovery pointer) when no grant exists', async () => {
    window.location.hash = '';
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any);

    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/Reset Link Expired or Invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/administrator-assisted recovery/i)).toBeInTheDocument();

    // Submit stays disabled without a verified grant — no dead-end form.
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText(/confirm new password/i), { target: { value: 'NewPass1234' } });
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
  });

  it('reports a failed update truthfully instead of claiming success', async () => {
    window.location.hash = '#type=recovery';
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as any);
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({ error: { message: 'New password should be different from the old one.' } } as any);

    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), { target: { value: 'NewPass1234' } });
    fireEvent.change(screen.getByPlaceholderText(/confirm new password/i), { target: { value: 'NewPass1234' } });
    fireEvent.submit(screen.getByLabelText('Set New Password Form'));

    // The mocked updateUser resolves immediately: flush microtasks (waitFor
    // would fight the fake timers).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/different from the old one/i)).toBeInTheDocument();
    expect(screen.queryByText(/has been updated successfully/i)).not.toBeInTheDocument();
  });
});
