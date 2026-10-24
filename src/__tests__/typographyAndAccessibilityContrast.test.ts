import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Calculates relative luminance for an sRGB color per WCAG 2.2 specifications.
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates WCAG 2.2 contrast ratio between foreground and background.
 * Ratio = (L1 + 0.05) / (L2 + 0.05) where L1 is lighter and L2 is darker.
 */
function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const lum1 = getRelativeLuminance(foregroundHex);
  const lum2 = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Typography & WCAG 2.2 AA Contrast Compliance Suite', () => {
  const rootDir = path.resolve(import.meta.dirname, '../../');

  describe('1. Global Typography & Plus Jakarta Sans Priority', () => {
    it('verifies index.html loads Plus Jakarta Sans with weights 400 through 800', () => {
      const indexPath = path.join(rootDir, 'index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('family=Plus+Jakarta+Sans:wght@400;500;600;700;800');
    });

    it('verifies src/index.css places Plus Jakarta Sans as the FIRST family in --font-sans', () => {
      const cssPath = path.join(rootDir, 'src', 'index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Must be first in the font list
      expect(css).toMatch(/--font-sans:\s*"Plus Jakarta Sans"/);
    });

    it('verifies src/index.css applies var(--font-sans) to body and inherits into form controls', () => {
      const cssPath = path.join(rootDir, 'src', 'index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('font-family: var(--font-sans);');
      expect(css).toMatch(/button,\s*input,\s*optgroup,\s*select,\s*textarea\s*\{\s*font-family:\s*inherit;/);
    });
  });

  describe('2. Button Disabled State Contrast & Opacity Washout Elimination', () => {
    it('verifies button.tsx does NOT apply destructive global opacity-50 on disabled state', () => {
      const buttonPath = path.join(rootDir, 'src', 'components', 'ui', 'button.tsx');
      const content = fs.readFileSync(buttonPath, 'utf-8');

      // The old anti-pattern was disabled:opacity-50 in the base cva string
      expect(content).not.toContain('disabled:opacity-50');
      expect(content).toContain('disabled:pointer-events-none disabled:cursor-not-allowed');
    });

    it('verifies button.tsx provides deliberate high-contrast disabled states for primary buttons', () => {
      const buttonPath = path.join(rootDir, 'src', 'components', 'ui', 'button.tsx');
      const content = fs.readFileSync(buttonPath, 'utf-8');

      expect(content).toContain('disabled:bg-[#EBE4DA]');
      expect(content).toContain('disabled:text-[#5C5248]');
      expect(content).toContain('dark:disabled:bg-[#2A201C]');
      expect(content).toContain('dark:disabled:text-[#A89E93]');
    });

    it('mathematically proves primary disabled button exceeds WCAG 2.2 AA (4.5:1) in light mode', () => {
      const bg = '#EBE4DA';
      const text = '#5C5248';
      const ratio = getContrastRatio(text, bg);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(6.04, 1);
    });

    it('mathematically proves primary disabled button exceeds WCAG 2.2 AA (4.5:1) in dark mode', () => {
      const bg = '#2A201C';
      const text = '#A89E93';
      const ratio = getContrastRatio(text, bg);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(6.06, 1);
    });
  });

  describe('3. Password Recovery Warning Message Readability & Contrast', () => {
    it('verifies LoginForm.tsx uses theme-aware contrast on the Assisted Recovery warning banner', () => {
      const loginPath = path.join(rootDir, 'src', 'features', 'auth', 'components', 'LoginForm.tsx');
      const content = fs.readFileSync(loginPath, 'utf-8');

      // No pale text on pale background
      expect(content).not.toContain('bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200');
      expect(content).toContain('bg-amber-500/15 dark:bg-amber-950/60');
      expect(content).toContain('text-amber-950 dark:text-amber-100');
      expect(content).toContain('text-amber-900 dark:text-amber-200/90');
    });

    it('mathematically proves light mode warning heading exceeds WCAG 2.2 AA contrast', () => {
      // Light mode amber alert surface: amber-500/15 over warm ivory (#F6F1EC) produces approx #F9EED9
      const surface = '#F9EED9';
      const heading = '#451A03'; // text-amber-950
      const ratio = getContrastRatio(heading, surface);

      expect(ratio).toBeGreaterThanOrEqual(7.0); // WCAG AAA is 7:1
    });

    it('mathematically proves light mode warning body exceeds WCAG 2.2 AA contrast', () => {
      const surface = '#F9EED9';
      const body = '#78350F'; // text-amber-900
      const ratio = getContrastRatio(body, surface);

      expect(ratio).toBeGreaterThanOrEqual(4.5); // Meets WCAG AA
    });

    it('mathematically proves dark mode warning text exceeds WCAG 2.2 AA contrast', () => {
      // Dark mode amber alert surface: amber-950/60 over dark background (#1F1816) produces approx #2E1E14
      const surface = '#2E1E14';
      const heading = '#FEF3C7'; // text-amber-100
      const ratio = getContrastRatio(heading, surface);

      expect(ratio).toBeGreaterThanOrEqual(7.0); // WCAG AAA is 7:1
    });
  });

  describe('4. Input Placeholders & Form Instructions Readability', () => {
    it('mathematically proves placeholder text in light mode meets WCAG AA readability', () => {
      // Background: Card surface #FAF7F2; Placeholder: muted-foreground #7A7067
      const bg = '#FAF7F2';
      const placeholder = '#7A7067';
      const ratio = getContrastRatio(placeholder, bg);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('mathematically proves deep roasted coffee entered text has ultra-high contrast', () => {
      const bg = '#FAF7F2';
      const text = '#241B18'; // Deep Roasted Coffee
      const ratio = getContrastRatio(text, bg);

      expect(ratio).toBeGreaterThan(14.0);
    });
  });
});
