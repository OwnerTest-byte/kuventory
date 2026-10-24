// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SupportContactDirectory } from '../SupportContactDirectory';
import type { PublicSupportContact } from '@/features/admin/services/profileService';

const admin = (over: Partial<PublicSupportContact>): PublicSupportContact => ({
  display_name: 'Admin',
  job_title: 'Branch Administrator',
  support_phone: null,
  support_email: null,
  avatar_url: null,
  role: 'ADMIN',
  links: [],
  ...over,
});

afterEach(() => cleanup());

describe('SupportContactDirectory — one card per published administrator', () => {
  it('renders three admin cards when all three publish, each with only their own channels', () => {
    render(
      <SupportContactDirectory
        contacts={[
          admin({ display_name: 'Juan Dela Cruz', role: 'SUPER_ADMIN', job_title: 'System Administrator', support_phone: '+63 917 111 1111' }),
          admin({ display_name: 'Maria Reyes', support_email: 'maria@kuventory.com' }),
          admin({
            display_name: 'Ana Santos',
            links: [{ id: 'l1', label: 'Messenger', platform: 'facebook', url: 'https://m.me/ana', sort_order: 1 }],
          }),
        ]}
      />
    );

    // Directory header present exactly once.
    expect(screen.getAllByText('Contact an Administrator')).toHaveLength(1);

    // Each admin gets their own card with name and role badge.
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('Maria Reyes')).toBeInTheDocument();
    expect(screen.getByText('Ana Santos')).toBeInTheDocument();
    expect(screen.getByText('System Administrator')).toBeInTheDocument();
    expect(screen.getAllByText('Branch Administrator')).toHaveLength(2);

    // Per-admin channels only: Juan phone, Maria email, Ana link chip.
    expect(screen.getByText('+63 917 111 1111')).toBeInTheDocument();
    expect(screen.getByText('maria@kuventory.com')).toBeInTheDocument();
    expect(screen.getByText('Messenger')).toBeInTheDocument();
  });

  it('renders a single compact card when only one admin published', () => {
    render(<SupportContactDirectory contacts={[admin({ display_name: 'Solo Admin', support_phone: '123' })]} />);
    expect(screen.getByText('Solo Admin')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('filters out administrators with no public method (server already does; client defends too)', () => {
    render(
      <SupportContactDirectory
        contacts={[admin({ display_name: 'Ghost Admin' }), admin({ display_name: 'Real Admin', support_phone: '999' })]}
      />
    );
    expect(screen.queryByText('Ghost Admin')).not.toBeInTheDocument();
    expect(screen.getByText('Real Admin')).toBeInTheDocument();
  });

  it('shows the honest fallback when nobody published (lockout screen contract)', () => {
    render(
      <SupportContactDirectory
        contacts={[]}
        emptyFallback={<p>No public support channels configured.</p>}
      />
    );
    expect(screen.getByText('No public support channels configured.')).toBeInTheDocument();
    expect(screen.queryByText('Contact an Administrator')).not.toBeInTheDocument();
  });

  it('renders nothing at all when empty and no fallback provided (recovery dialog contract)', () => {
    const { container } = render(<SupportContactDirectory contacts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses avatar images when provided and initials otherwise', () => {
    render(
      <SupportContactDirectory
        contacts={[
          admin({ display_name: 'Pic Admin', avatar_url: 'https://x/a.png', support_phone: '2' }),
          admin({ display_name: 'Initials Admin', support_phone: '1' }),
        ]}
      />
    );
    expect(document.querySelector('img[src="https://x/a.png"]')).toBeTruthy();
    expect(screen.getByText('IA')).toBeInTheDocument(); // Initials Admin -> I.A.
  });
});
