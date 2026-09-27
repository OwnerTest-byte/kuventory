import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('SEO & Search Engine Coffee Logo & Brand Assets Integrity', () => {
  const rootDir = path.resolve(import.meta.dirname, '../../');
  const publicDir = path.join(rootDir, 'public');

  it('contains valid coffee logo files in public and pics folders', () => {
    const requiredCoffeeFiles = [
      path.join('pics', 'logo-icon.png'),
      path.join('pics', 'logo-original.png'),
      path.join('pics', 'logo-transparent.png'),
      'logo-icon.png',
      'favicon.png',
    ];

    for (const file of requiredCoffeeFiles) {
      const filePath = path.join(publicDir, file);
      expect(fs.existsSync(filePath), `Expected ${file} to exist in public/`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Expected ${file} to have non-zero size`).toBeGreaterThan(0);
    }
  });

  it('validates index.html points icon tags and og:image directly to the coffee logo', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    // Coffee Logo & App Icons
    expect(html).toContain('<link rel="icon" type="image/png" href="/pics/logo-icon.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/pics/logo-icon.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="480x480" href="/pics/logo-original.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/pics/logo-icon.png" />');
    expect(html).toContain('<meta property="og:image" content="https://kuventory.netlify.app/pics/logo-original.png" />');

    // Site Name and Branding
    expect(html).toContain('<meta property="og:site_name" content="KUVENTORY" />');
    expect(html).toContain('<meta name="application-name" content="KUVENTORY" />');

    // Schema.org WebSite JSON-LD
    expect(html).toContain('"@type": "WebSite"');
    expect(html).toContain('"name": "KUVENTORY"');
    expect(html).toContain('"url": "https://kuventory.netlify.app/"');
  });

  it('validates sitemap.xml and sitemap-main.xml contain Google Image tags with the coffee logo across all routes', () => {
    const sitemaps = ['sitemap.xml', 'sitemap-main.xml'];

    for (const sm of sitemaps) {
      const smPath = path.join(publicDir, sm);
      expect(fs.existsSync(smPath), `Expected ${sm} to exist`).toBe(true);
      const content = fs.readFileSync(smPath, 'utf-8');

      // Valid XML header and Google Image namespace
      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');

      // Contains coffee logo and icon images
      expect(content).toContain('pics/logo-original.png');
      expect(content).toContain('pics/logo-icon.png');
      expect(content).toContain('KUVENTORY Coffee Bistro Logo');

      // Contains critical routes
      expect(content).toContain('/inventory');
      expect(content).toContain('/daily-inventory');
      expect(content).toContain('/reports');
    }
  });

  it('validates manifest.json includes application name and coffee logo icons', () => {
    const manifestPath = path.join(publicDir, 'manifest.json');
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifestContent.short_name).toBe('KUVENTORY');
    expect(manifestContent.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifestContent.icons.some((i: any) => i.src === '/pics/logo-icon.png')).toBe(true);
  });
});
