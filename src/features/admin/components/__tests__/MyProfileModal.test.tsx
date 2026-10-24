// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyProfileModal } from '../MyProfileModal';
import {
  updateMyProfile,
  fetchMyContactLinks,
} from '../../services/profileService';
import { useAuth } from '@/features/auth/context/AuthContext';

vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../services/profileService', () => ({
  updateMyProfile: vi.fn(),
  fetchMyContactLinks: vi.fn(async () => []),
  upsertContactLink: vi.fn(),
  deleteContactLink: vi.fn(),
  uploadProfileAvatar: vi.fn(),
}));

const FULL_PROFILE = {
  id: 'u1',
  role: 'ADMIN',
  display_name: 'Juan Dela Cruz',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  job_title: 'Branch Manager',
  phone: '+63 917 000 0000',
  support_phone: '+63 917 123 4567',
  support_email: 'juan@kuventory.com',
  show_on_lockout_screen: true,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderModal(profile = FULL_PROFILE) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1', email: 'juan@kuventory.com' } as any,
    profile: profile as any,
  } as any);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MyProfileModal open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchMyContactLinks).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MyProfileModal — saved profile values actually flow back (the "nothing saves" regression)', () => {
  it('populates every field from the full profile row', () => {
    renderModal();

    expect((screen.getByLabelText(/display name/i) as HTMLInputElement).value).toBe('Juan Dela Cruz');
    expect((screen.getByLabelText(/work \/ support phone/i) as HTMLInputElement).value).toBe('+63 917 123 4567');
    expect((screen.getByLabelText(/support contact email/i) as HTMLInputElement).value).toBe('juan@kuventory.com');
    expect((screen.getByLabelText(/job title/i) as HTMLInputElement).value).toBe('Branch Manager');
    expect((screen.getByLabelText(/first name/i) as HTMLInputElement).value).toBe('Juan');
    expect((screen.getByLabelText(/last name/i) as HTMLInputElement).value).toBe('Dela Cruz');
    expect((screen.getByLabelText(/show on locked login screen/i) as HTMLInputElement).checked).toBe(true);
  });
});

describe('MyProfileModal — honest validation before save', () => {
  it('blocks save when the display name is empty', async () => {
    renderModal({ ...FULL_PROFILE, display_name: '' });
    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));

    await waitFor(() => {
      expect(screen.getByText('Display name is required.')).toBeInTheDocument();
    });
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('blocks save for an invalid support email format', async () => {
    renderModal({ ...FULL_PROFILE, support_email: 'not-an-email' });
    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    });
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('blocks an opt-in with zero public channels (silent invisibility is not allowed)', async () => {
    // Both phones cleared: the modal intentionally falls back to the personal
    // phone for the support line, so it must be empty too.
    renderModal({ ...FULL_PROFILE, show_on_lockout_screen: true, support_phone: '', phone: '', support_email: '' });
    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/Add at least one contact channel/i)).toBeInTheDocument();
    });
    expect(updateMyProfile).not.toHaveBeenCalled();
  });
});

describe('MyProfileModal — connected save flow', () => {
  it('saves trimmed values and states the channels are live on the recovery screens', async () => {
    vi.mocked(updateMyProfile).mockResolvedValue({ success: true });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/now live on the login recovery and lockout screens/i)).toBeInTheDocument();
    });
    expect(updateMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Juan Dela Cruz',
        supportPhone: '+63 917 123 4567',
        supportEmail: 'juan@kuventory.com',
        showOnLockoutScreen: true,
      })
    );
  });

  it('states contacts stay private when not opted in', async () => {
    vi.mocked(updateMyProfile).mockResolvedValue({ success: true });
    renderModal({ ...FULL_PROFILE, show_on_lockout_screen: false });

    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/contacts stay private/i)).toBeInTheDocument();
    });
  });
});
