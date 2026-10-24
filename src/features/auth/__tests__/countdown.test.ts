import { describe, it, expect } from 'vitest';
import {
  deriveServerOffsetMs,
  computeRemainingSeconds,
  formatTimer,
  formatRemainingLabel
} from '../utils/countdown';

describe('Server-authoritative countdown helpers', () => {
  const T0 = Date.UTC(2026, 9, 25, 12, 0, 0); // 2026-10-25T12:00:00Z

  describe('deriveServerOffsetMs', () => {
    it('computes a positive offset when the server clock is ahead', () => {
      const serverNow = new Date(T0 + 2500).toISOString();
      expect(deriveServerOffsetMs(serverNow, T0)).toBe(2500);
    });

    it('computes a negative offset when the server clock is behind', () => {
      const serverNow = new Date(T0 - 4000).toISOString();
      expect(deriveServerOffsetMs(serverNow, T0)).toBe(-4000);
    });

    it('returns null for missing or unparseable timestamps', () => {
      expect(deriveServerOffsetMs(null, T0)).toBeNull();
      expect(deriveServerOffsetMs(undefined, T0)).toBeNull();
      expect(deriveServerOffsetMs('not-a-date', T0)).toBeNull();
    });
  });

  describe('computeRemainingSeconds (expiry-derived, not decremented)', () => {
    const expiry = new Date(T0 + 120_000).toISOString(); // T0 + 120s

    it('returns the full duration at the start', () => {
      expect(computeRemainingSeconds(expiry, { offsetMs: 0 }, T0)).toBe(120);
    });

    it('derives the correct value purely from the clock as time passes', () => {
      // Browser interval fired late/throttled: 47.2s of real time elapsed.
      expect(computeRemainingSeconds(expiry, { offsetMs: 0 }, T0 + 47_212)).toBe(73);
    });

    it('evaluates remaining time in the authoritative server clock frame', () => {
      // offset = serverClock - clientClock. With offset -10s, the server's
      // "now" trails the client, so per the AUTHORITY more time remains to
      // the recorded expiry instant; with +10s, less.
      expect(computeRemainingSeconds(expiry, { offsetMs: -10_000 }, T0)).toBe(130);
      expect(computeRemainingSeconds(expiry, { offsetMs: 10_000 }, T0)).toBe(110);
    });

    it('rounds up sub-second remainders so zero is reached exactly at the deadline', () => {
      expect(computeRemainingSeconds(expiry, { offsetMs: 0 }, T0 + 119_001)).toBe(1);
      expect(computeRemainingSeconds(expiry, { offsetMs: 0 }, T0 + 120_000)).toBe(0);
    });

    it('never returns negative values after the deadline', () => {
      expect(computeRemainingSeconds(expiry, { offsetMs: 0 }, T0 + 300_000)).toBe(0);
    });

    it('returns 0 for missing or invalid expiry', () => {
      expect(computeRemainingSeconds(null, null, T0)).toBe(0);
      expect(computeRemainingSeconds('garbage', { offsetMs: 0 }, T0)).toBe(0);
    });

    it('a 30-minute lockout counts down consistently across a simulated session', () => {
      const lockoutExpiry = new Date(T0 + 1800_000).toISOString();
      const samples: number[] = [];
      // Simulate 1s ticks, including a background-tab stall of 64s.
      const ticks = [0, 1000, 2000, 3000, 4000, 68_000, 69_000, 1_798_000, 1_799_000, 1_800_000];
      for (const t of ticks) {
        samples.push(computeRemainingSeconds(lockoutExpiry, { offsetMs: 0 }, T0 + t));
      }
      expect(samples).toEqual([1800, 1799, 1798, 1797, 1796, 1732, 1731, 2, 1, 0]);
      // Strictly decreasing except at duplicated boundaries; never stuck.
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
      }
    });
  });

  describe('formatTimer', () => {
    it('formats MM:SS under an hour', () => {
      expect(formatTimer(0)).toBe('00:00');
      expect(formatTimer(9)).toBe('00:09');
      expect(formatTimer(59)).toBe('00:59');
      expect(formatTimer(60)).toBe('01:00');
      expect(formatTimer(95)).toBe('01:35');
      expect(formatTimer(120)).toBe('02:00');
      expect(formatTimer(1799)).toBe('29:59');
      expect(formatTimer(1800)).toBe('30:00');
    });

    it('formats H:MM:SS at an hour and beyond', () => {
      expect(formatTimer(3600)).toBe('1:00:00');
      expect(formatTimer(3601)).toBe('1:00:01');
    });

    it('clamps negative input to zero', () => {
      expect(formatTimer(-5)).toBe('00:00');
    });
  });

  describe('formatRemainingLabel', () => {
    it('labels seconds-only remainders', () => {
      expect(formatRemainingLabel(45)).toBe('45s');
      expect(formatRemainingLabel(5)).toBe('5s');
    });

    it('labels mixed minutes and seconds', () => {
      expect(formatRemainingLabel(95)).toBe('1m 35s');
      expect(formatRemainingLabel(120)).toBe('2m');
    });
  });
});
