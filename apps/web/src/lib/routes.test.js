import { describe, expect, it } from 'vitest';
import { APP_ROUTES, PAGE_INFO, resolvePageInfo } from './routes.js';

describe('route metadata', () => {
  it('resolves exact application routes', () => {
    expect(resolvePageInfo(APP_ROUTES.adminStores)).toBe(PAGE_INFO[APP_ROUTES.adminStores]);
    expect(resolvePageInfo(APP_ROUTES.rental)).toBe(PAGE_INFO[APP_ROUTES.rental]);
  });

  it('keeps nested admin paths in the admin area', () => {
    expect(resolvePageInfo('/admin/plans/edit/growth')).toBe(PAGE_INFO[APP_ROUTES.adminPlans]);
    expect(resolvePageInfo('/admin/unknown')).toBe(PAGE_INFO[APP_ROUTES.admin]);
  });

  it('falls back to dashboard metadata', () => {
    expect(resolvePageInfo('/unknown')).toBe(PAGE_INFO[APP_ROUTES.dashboard]);
  });
});
