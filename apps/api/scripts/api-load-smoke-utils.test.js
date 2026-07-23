import { describe, expect, it } from 'vitest';
import {
  buildCyclePlan,
  buildRecoveryManifest,
  createCleanupController,
  evaluateLoadGate,
  fetchWithTimeout,
  assertRecoveryManifestOldEnough,
  isSuccessfulReturnCleanup,
  percentile,
  summarizeMeasurements,
  validateRecoveryManifest,
  verifyGzipEncoding,
} from './api-load-smoke-utils.mjs';

describe('API load smoke metrics', () => {
  it('calculates nearest-rank percentiles without mutating measurements', () => {
    const values = [40, 10, 30, 20];

    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(40);
    expect(values).toEqual([40, 10, 30, 20]);
  });

  it('summarizes latency and HTTP failures', () => {
    expect(summarizeMeasurements([
      { durationMs: 10, status: 200 },
      { durationMs: 20, status: 503 },
      { durationMs: 30, status: 204 },
    ])).toMatchObject({
      requests: 3,
      failures: 1,
      errorRate: 1 / 3,
      p50Ms: 20,
      p95Ms: 30,
      maxMs: 30,
    });
  });

  it('reports every failed release threshold', () => {
    expect(evaluateLoadGate({
      errorRate: 0.02,
      p95Ms: 1_501,
      stockMismatchCount: 1,
    }, {
      maxErrorRate: 0.01,
      maxReadP95Ms: 1_500,
      maxStockMismatchCount: 0,
    })).toEqual([
      'error rate 2.00% exceeds 1.00%',
      'read p95 1501ms exceeds 1500ms',
      'stock mismatch count 1 exceeds 0',
    ]);
  });
});

describe('API load smoke safety controls', () => {
  it('requires an old-enough manifest before final recovery cleanup', () => {
    const manifest = { createdAt: '2026-07-22T00:00:00.000Z' };
    expect(() => assertRecoveryManifestOldEnough(manifest, {
      nowMs: Date.parse('2026-07-22T00:02:09.999Z'),
      minimumAgeMs: 130_000,
    })).toThrow(/wait before finalizing/i);
    expect(() => assertRecoveryManifestOldEnough(manifest, {
      nowMs: Date.parse('2026-07-22T00:02:10.000Z'),
      minimumAgeMs: 130_000,
    })).not.toThrow();
  });

  it('treats repeated or never-created return cleanup as idempotent success', () => {
    expect(isSuccessfulReturnCleanup({ status: 200, message: '' })).toBe(true);
    expect(isSuccessfulReturnCleanup({ status: 400, message: 'Rental already returned' })).toBe(true);
    expect(isSuccessfulReturnCleanup({ status: 400, message: 'Rental not found' })).toBe(true);
    expect(isSuccessfulReturnCleanup({ status: 403, message: 'Forbidden' })).toBe(false);
  });

  it('aborts a stalled request after the configured timeout', async () => {
    let receivedSignal;
    const stalledFetch = (_url, options) => new Promise((_resolve, reject) => {
      receivedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });

    await expect(fetchWithTimeout(stalledFetch, 'https://example.test/api', {}, 10))
      .rejects.toThrow(/timed out/i);
    expect(receivedSignal.aborted).toBe(true);
  });

  it('requires raw gzip response metadata only when explicitly enabled', () => {
    const gzipHeaders = new Headers({ 'content-encoding': 'br, gzip' });
    expect(verifyGzipEncoding(gzipHeaders, { required: true, url: 'https://example.test/api/items' }))
      .toEqual('gzip');
    expect(() => verifyGzipEncoding(new Headers(), {
      required: true,
      url: 'https://example.test/api/items',
    })).toThrow(/Content-Encoding.*gzip/);
    expect(verifyGzipEncoding(new Headers(), {
      required: false,
      url: 'http://localhost:4000/api/items',
    })).toBe(null);
  });

  it('precomputes every cleanup identifier from the persisted run prefix', () => {
    expect(buildCyclePlan('LOAD-123-abcdef', 2)).toEqual([
      {
        suffix: '01',
        rentalId: 'LOAD-123-abcdef-01',
        customerPhone: 'LOAD-123-abcdef-01',
      },
      {
        suffix: '02',
        rentalId: 'LOAD-123-abcdef-02',
        customerPhone: 'LOAD-123-abcdef-02',
      },
    ]);
  });

  it('builds a recovery manifest without credentials or database configuration', () => {
    const manifest = buildRecoveryManifest({
      runPrefix: 'LOAD-123-abcdef',
      baseUrl: 'https://kasir.example.com',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      itemId: 'item-1',
      initialStock: 10,
      cyclePlan: buildCyclePlan('LOAD-123-abcdef', 1),
      token: 'must-not-be-persisted',
      password: 'must-not-be-persisted',
      databaseUrl: 'must-not-be-persisted',
    });

    expect(manifest).toMatchObject({
      version: 1,
      runPrefix: 'LOAD-123-abcdef',
      baseUrl: 'https://kasir.example.com',
      initialStock: 10,
    });
    expect(JSON.stringify(manifest)).not.toMatch(/must-not-be-persisted/);
    expect(() => buildRecoveryManifest({
      ...manifest,
      baseUrl: 'https://api-user:api-password@kasir.example.com',
    })).toThrow(/must not contain credentials/);
  });

  it('accepts only recovery manifests scoped to the configured target and prefix', () => {
    const manifest = {
      version: 1,
      runPrefix: 'LOAD-123-abcdef',
      baseUrl: 'https://kasir.example.com',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      itemId: 'item-1',
      initialStock: 10,
      cyclePlan: buildCyclePlan('LOAD-123-abcdef', 2),
    };

    expect(validateRecoveryManifest(manifest, {
      baseUrl: 'https://kasir.example.com',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    })).toEqual(manifest);
    expect(() => validateRecoveryManifest(
      { ...manifest, baseUrl: 'https://staging.example.com' },
      {
        baseUrl: 'https://kasir.example.com',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
    )).toThrow(/does not match the configured API target/);
    expect(() => validateRecoveryManifest(
      { ...manifest, cyclePlan: [{ rentalId: 'rental-user-data', customerPhone: 'customer-user-data' }] },
      {
        baseUrl: 'https://kasir.example.com',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
    )).toThrow(/unsafe recovery identifier/);
    expect(() => validateRecoveryManifest(
      { ...manifest, token: 'secret-token' },
      {
        baseUrl: 'https://kasir.example.com',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
    )).toThrow(/must not contain credentials/);
  });

  it('runs bounded cleanup once and reports timeout recovery details', async () => {
    let cleanupCalls = 0;
    const controller = createCleanupController({
      timeoutMs: 10,
      recoveryFile: 'C:/tmp/LOAD-123.json',
      cleanup: async () => {
        cleanupCalls += 1;
        await new Promise(() => {});
      },
    });

    const first = controller.run('SIGTERM');
    const second = controller.run('finally');
    await expect(first).rejects.toThrow(/Cleanup timed out.*LOAD-123\.json/);
    await expect(second).rejects.toThrow(/Cleanup timed out.*LOAD-123\.json/);
    expect(cleanupCalls).toBe(1);
  });
});
