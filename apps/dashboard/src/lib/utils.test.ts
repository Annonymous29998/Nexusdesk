import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, initials } from '@/lib/utils';
import { buildAnalyticsOverview, createMockTokens } from '@/lib/mock-data';

describe('utils', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats duration', () => {
    const start = new Date('2026-01-01T00:00:00Z').toISOString();
    const end = new Date('2026-01-01T00:05:30Z').toISOString();
    expect(formatDuration(start, end)).toBe('5m 30s');
  });

  it('builds initials', () => {
    expect(initials('Alex Rivera')).toBe('AR');
  });
});

describe('mock data', () => {
  it('builds analytics overview shape', () => {
    const overview = buildAnalyticsOverview();
    expect(overview.series.length).toBe(14);
    expect(overview.devicesTotal).toBeGreaterThan(0);
    expect(Array.isArray(overview.byPlatform)).toBe(true);
  });

  it('creates token pair', () => {
    const tokens = createMockTokens();
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.accessToken).toMatch(/^demo_access_/);
  });
});
