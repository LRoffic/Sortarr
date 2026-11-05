import { describe, it, expect } from 'vitest';
import { getLocalDateKey, loadHistoryStore, getFormattedStatsHistory } from '../src/lib/history.server.js';

describe('history.server', () => {
  describe('getLocalDateKey', () => {
    it('formats a date as YYYY-MM-DD', () => {
      const d = new Date(2026, 10, 5); // month 10 is November in 0-indexed JS Date
      const key = getLocalDateKey(d);
      expect(key).toBe('2026-11-05');
    });

    it('pads single-digit days and months with 0', () => {
      const d = new Date(2026, 0, 7); // January 7
      const key = getLocalDateKey(d);
      expect(key).toBe('2026-01-07');
    });
  });

  describe('loadHistoryStore', () => {
    it('loads or initializes a valid store structure', () => {
      const store = loadHistoryStore();
      expect(store).toHaveProperty('trackers');
      expect(typeof store.trackers).toBe('object');
    });
  });

  describe('getFormattedStatsHistory', () => {
    it('returns an object containing trackers and datesDesc arrays', () => {
      const res = getFormattedStatsHistory([]);
      expect(res).toHaveProperty('trackers');
      expect(res).toHaveProperty('datesDesc');
      expect(Array.isArray(res.trackers)).toBe(true);
      expect(Array.isArray(res.datesDesc)).toBe(true);
    });
  });
});
