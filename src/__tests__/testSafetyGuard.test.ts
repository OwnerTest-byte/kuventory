import { describe, it, expect } from 'vitest';
import { assertSafeE2EEnvironment, extractProjectRef } from '../../e2e/helpers/testSafetyGuard';

describe('E2E Production Protection & Test Safety Guard (KUV-P0-02)', () => {
  it('extracts project reference correctly from Supabase URLs', () => {
    expect(extractProjectRef('https://stotgoylyzltzpahuglc.supabase.co')).toBe('stotgoylyzltzpahuglc');
    expect(extractProjectRef('http://127.0.0.1:54321')).toBe('127.0.0.1');
    expect(extractProjectRef('http://localhost:54321')).toBe('localhost');
  });

  it('throws hard abort when URL or key is missing', () => {
    expect(() => {
      assertSafeE2EEnvironment({ url: '', key: '' });
    }).toThrow(/HARD ABORT: Missing E2E Supabase configuration/);
  });

  it('permits local disposable containers without remote authorization', () => {
    const config = assertSafeE2EEnvironment({
      url: 'http://127.0.0.1:54321',
      key: 'sb_test_local_key',
    });
    expect(config.isRemote).toBe(false);
    expect(config.projectRef).toBe('127.0.0.1');
  });

  it('throws hard abort when target is remote and E2E_ALLOW_REMOTE is not true', () => {
    expect(() => {
      assertSafeE2EEnvironment({
        url: 'https://stotgoylyzltzpahuglc.supabase.co',
        key: 'sb_test_remote_key',
        allowRemoteEnv: 'false',
      });
    }).toThrow(/HARD ABORT: Refusing to execute E2E tests against remote target/);
  });

  it('throws hard abort when target is remote, E2E_ALLOW_REMOTE is true, but project ref is not in allow-list', () => {
    expect(() => {
      assertSafeE2EEnvironment({
        url: 'https://stotgoylyzltzpahuglc.supabase.co',
        key: 'sb_test_remote_key',
        allowRemoteEnv: 'true',
        disposableAllowListEnv: 'staging12345,disposable_ref_99',
      });
    }).toThrow(/is NOT in the approved disposable staging allow-list/);
  });

  it('permits remote execution when E2E_ALLOW_REMOTE is true and project ref matches allow-list', () => {
    const config = assertSafeE2EEnvironment({
      url: 'https://disposable_ref_99.supabase.co',
      key: 'sb_test_remote_key',
      allowRemoteEnv: 'true',
      disposableAllowListEnv: 'staging12345,disposable_ref_99',
    });
    expect(config.isRemote).toBe(true);
    expect(config.projectRef).toBe('disposable_ref_99');
  });
});
