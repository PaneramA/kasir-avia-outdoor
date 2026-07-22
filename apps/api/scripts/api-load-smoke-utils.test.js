import { describe, expect, it } from 'vitest';
import {
  evaluateLoadGate,
  percentile,
  summarizeMeasurements,
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
