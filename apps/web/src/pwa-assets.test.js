import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const manifestPath = fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url));
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
const serviceWorkerPath = fileURLToPath(new URL('../public/sw.js', import.meta.url));

const expectedIconPaths = [
  '/icons/sewantara-icon-192.png',
  '/icons/sewantara-icon-512.png',
  '/icons/sewantara-icon-maskable-512.png',
];

describe('PWA branding assets', () => {
  it('uses cache-busted Sewantara icon filenames for installable app icons', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const indexHtml = readFileSync(indexPath, 'utf8');
    const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
    const manifestIconPaths = manifest.icons.map((icon) => icon.src);

    expect(manifestIconPaths).toEqual(expect.arrayContaining(expectedIconPaths));
    expect(manifestIconPaths).not.toContain('/icons/icon-192.png');
    expect(indexHtml).toContain('/icons/sewantara-icon-192.png');
    expect(indexHtml).toContain('/icons/sewantara-apple-touch-icon.png');
    expect(serviceWorker).toContain('sewantara-shell-v2');
    expectedIconPaths.forEach((iconPath) => {
      expect(serviceWorker).toContain(iconPath);
      expect(existsSync(fileURLToPath(new URL(`../public${iconPath}`, import.meta.url)))).toBe(true);
    });
  });
});
