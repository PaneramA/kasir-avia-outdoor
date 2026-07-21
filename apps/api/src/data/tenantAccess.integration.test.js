import { describe, it } from 'vitest';
import { runTenantAccessSmoke } from '../../scripts/tenant-access-smoke.mjs';

describe('tenant database integration', () => {
  it('enforces tenant isolation, subscription access, owner protection, and cascade deletion', async () => {
    await runTenantAccessSmoke();
  }, 60_000);
});
