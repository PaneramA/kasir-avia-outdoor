import { describe, expect, it } from 'vitest';
import {
  canAccessAllTenantBranches,
  isActiveStatus,
  normalizeTenantRole,
} from './accessPolicy.js';

describe('tenant access policy helpers', () => {
  describe('normalizeTenantRole', () => {
    it('trims whitespace and lowercases role strings', () => {
      expect(normalizeTenantRole('  AdMiN ')).toBe('admin');
    });

    it('normalizes null to an empty string', () => {
      expect(normalizeTenantRole(null)).toBe('');
    });
  });

  describe('isActiveStatus', () => {
    it('accepts active status regardless of casing and whitespace', () => {
      expect(isActiveStatus('  ACTIVE ')).toBe(true);
    });

    it('rejects null and non-active statuses', () => {
      expect(isActiveStatus(null)).toBe(false);
      expect(isActiveStatus('inactive')).toBe(false);
    });
  });

  describe('canAccessAllTenantBranches', () => {
    it.each([
      ['SUPERUSER', null],
      [' admin ', null],
      [null, 'OWNER'],
      [null, ' admin '],
    ])('allows global branch access for global role %s or membership role %s', (globalRole, membershipRole) => {
      expect(canAccessAllTenantBranches(globalRole, membershipRole)).toBe(true);
    });

    it.each([
      ['kasir', 'kasir'],
      [null, null],
    ])('denies global branch access for global role %s and membership role %s', (globalRole, membershipRole) => {
      expect(canAccessAllTenantBranches(globalRole, membershipRole)).toBe(false);
    });
  });
});
