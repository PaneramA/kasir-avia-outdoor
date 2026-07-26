import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('global theme tokens', () => {
  it('uses the white-green theme foundation instead of the legacy orange accent', () => {
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
    const sidebar = readFileSync(new URL('./components/Sidebar.jsx', import.meta.url), 'utf8');

    expect(css).toContain('--accent: #146c43;');
    expect(css).toContain('--accent-hover: #0f5132;');
    expect(css).toContain('--radius: 6px;');
    expect(css).not.toContain('#dc5f00');
    expect(css).not.toContain('#b84d00');
    expect(sidebar).toContain('background=146c43');
    expect(sidebar).not.toContain('background=E67E22');
  });
});
