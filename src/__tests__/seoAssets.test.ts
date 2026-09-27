import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('SEO & Search Engine Favicon Assets Integrity', () => {
  const rootDir = path.resolve(import.meta.dirname, '../../');
  const publicDir = path.join(rootDir, 'public');

  it('contains valid favicon files satisfying Google Search Favicon specifications', () => {
    const requiredFaviconFiles = [
      'favicon.ico',
      'favicon-48x48.png',
      'favicon-96x96.png',
      'favicon.png',
      'logo-icon.png',
      'apple-touch-icon.png',
    ];

    for (const file of requiredFaviconFiles) {
      const filePath = path.join(publicDir, file);
      expect(fs.existsSync(filePath), `Expected ${file} to exist in public/`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Expected ${file} to have non-zero size`).toBeGreaterThan(0);
    }
  });

  it('validates index.html contains proper Google site name, favicons and WebSite schema', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    // Google Favicon tags
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');

    // Site Name and Branding
    expect(html).toContain('<meta property="og:site_name" content="KUVENTORY" />');
    expect(html).toContain('<meta name="application-name" content="KUVENTORY" />');

    // Schema.org WebSite JSON-LD
    expect(html).toContain('"@type": "WebSite"');
    expect(html).toContain('"name": "KUVENTORY"');
    expect(html).toContain('"url": "https://kuventory.netlify.app/"');
  });

  it('validates sitemap.xml and sitemap-main.xml have valid XML structure and Google image tags', () => {
    const sitemaps = ['sitemap.xml', 'sitemap-main.xml'];

    for (const sm of sitemaps) {
      const smPath = path.join(publicDir, sm);
      expect(fs.existsSync(smPath), `Expected ${sm} to exist`).toBe(true);
      const content = fs.readFileSync(smPath, 'utf-8');

      // Valid XML header
      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      // Image namespace
      expect(content).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
      // Contains key images
      expect(content).toContain('logo-transparent.png');
      expect(content).toContain('logo-icon.png');
      // Contains critical routes
      expect(content).toContain('/inventory');
      expect(content).toContain('/daily-inventory');
      expect(content).toContain('/reports');
    }
  });

  it('validates manifest.json includes application name and maskable icons', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifestContent.short_name).toBe('KUVENTORY');
    expect(manifestContent.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifestContent.icons.some((i: any) => i.sizes === '192x192')).toBe(true);
    expect(manifestContent.icons.some((i: any) => i.sizes === '512x512')).toBe(true);
  });
});
