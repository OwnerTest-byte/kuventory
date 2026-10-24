// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createRememberAwareAuthStorage } from '../supabase';

const TOKEN_KEY = 'sb-test-ref-auth-token';

describe('createRememberAwareAuthStorage — browser-close session semantics', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores the session in sessionStorage when Remember me is UNCHECKED (dies with the browser)', () => {
    localStorage.removeItem('kuventory_remember_me');
    const storage = createRememberAwareAuthStorage();

    storage.setItem(TOKEN_KEY, 'token-anon-session');

    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('token-anon-session');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(storage.getItem(TOKEN_KEY)).toBe('token-anon-session');
  });

  it('stores the session in localStorage when Remember me is CHECKED (survives restarts)', () => {
    localStorage.setItem('kuventory_remember_me', 'true');
    const storage = createRememberAwareAuthStorage();

    storage.setItem(TOKEN_KEY, 'token-remembered');

    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-remembered');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('always keeps exactly one copy: re-login with the other mode removes the stale copy', () => {
    localStorage.setItem('kuventory_remember_me', 'true');
    const storage = createRememberAwareAuthStorage();
    storage.setItem(TOKEN_KEY, 'remembered-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('remembered-token');

    // User unchecks Remember me and signs in again.
    localStorage.removeItem('kuventory_remember_me');
    storage.setItem(TOKEN_KEY, 'session-token');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('session-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('prefers sessionStorage on read (the most recent tab-level session wins)', () => {
    const storage = createRememberAwareAuthStorage();
    sessionStorage.setItem(TOKEN_KEY, 'from-session');
    localStorage.setItem(TOKEN_KEY, 'from-local');
    expect(storage.getItem(TOKEN_KEY)).toBe('from-session');
  });

  it('sign-out clears BOTH storages completely', () => {
    const storage = createRememberAwareAuthStorage();
    sessionStorage.setItem(TOKEN_KEY, 'a');
    localStorage.setItem(TOKEN_KEY, 'b');

    storage.removeItem(TOKEN_KEY);

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('boot sweep discards a pre-existing localStorage session that was never remembered', () => {
    localStorage.setItem(TOKEN_KEY, 'legacy-persisted-token');
    localStorage.setItem('kuventory_browser_session_active', '1');
    // No kuventory_remember_me flag.

    createRememberAwareAuthStorage();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem('kuventory_browser_session_active')).toBeNull();
  });

  it('boot sweep KEEPS a remembered localStorage session', () => {
    localStorage.setItem('kuventory_remember_me', 'true');
    localStorage.setItem(TOKEN_KEY, 'remembered-token');

    createRememberAwareAuthStorage();

    expect(localStorage.getItem(TOKEN_KEY)).toBe('remembered-token');
  });
});
