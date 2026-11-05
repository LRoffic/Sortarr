import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate } from '../src/lib/formatters.js';
import { getCurrentVersionDetails } from '../src/lib/updater.server.js';

describe('formatters', () => {
  it('formats ISO date string into French date and time', () => {
    // 2026-11-05T06:30:00.000Z
    const res = formatDateTime('2026-11-05T06:30:00.000Z');
    expect(res).toContain('05/11/2026');
    expect(res).toContain('à');
    expect(res).toMatch(/\d{2}:\d{2}/);
  });

  it('formats short date without time', () => {
    const res = formatDate('2026-11-05T06:30:00.000Z');
    expect(res).toBe('05/11/2026');
  });

  it('handles null, undefined and empty strings safely', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('handles invalid date strings gracefully', () => {
    expect(formatDateTime('invalid-date')).toBe('');
    expect(formatDate('invalid-date')).toBe('');
  });
});

describe('version details', () => {
  it('returns valid current version and lastUpdatedAt string', () => {
    const details = getCurrentVersionDetails();
    expect(details).toBeDefined();
    expect(details.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(details.lastUpdatedAt).toBeDefined();
    expect(typeof details.lastUpdatedAt).toBe('string');
  });
});
