import { describe, it, expect } from 'vitest';
import { parseSize, manualStats, resolveTrackerConn } from '../src/lib/tracker.server.js';

describe('tracker.server helpers', () => {
  describe('parseSize', () => {
    it('parses raw numbers directly', () => {
      expect(parseSize(1024)).toBe(1024);
      expect(parseSize(0)).toBe(0);
      expect(parseSize(null)).toBeNull();
      expect(parseSize(undefined)).toBeNull();
      expect(parseSize('')).toBeNull();
    });

    it('parses French units (o, Ko, Mo, Go, To)', () => {
      expect(parseSize('500 o')).toBe(500);
      expect(parseSize('1 Ko')).toBe(1024);
      expect(parseSize('2 Mo')).toBe(2 * 1024 ** 2);
      expect(parseSize('10 Go')).toBe(10 * 1024 ** 3);
      expect(parseSize('1.5 To')).toBe(1.5 * 1024 ** 4);
    });

    it('parses English / binary units (B, KB, MB, GB, TB, GiB, TiB)', () => {
      expect(parseSize('100 B')).toBe(100);
      expect(parseSize('4 KB')).toBe(4 * 1024);
      expect(parseSize('16 MB')).toBe(16 * 1024 ** 2);
      expect(parseSize('32 GB')).toBe(32 * 1024 ** 3);
      expect(parseSize('2 TiB')).toBe(2 * 1024 ** 4);
    });

    it('handles commas in decimal numbers ("12,5 Go")', () => {
      expect(parseSize('12,5 Go')).toBe(12.5 * 1024 ** 3);
      expect(parseSize('0,75 To')).toBe(0.75 * 1024 ** 4);
    });

    it('returns null for unrecognized text or corrupted inputs', () => {
      expect(parseSize('non-un-nombre Go')).toBeNull();
      expect(parseSize('123 InconnueUnite')).toBeNull();
      expect(parseSize('xyz')).toBeNull();
    });
  });

  describe('manualStats', () => {
    it('returns structured manual stats from config in GB', () => {
      const cfg = {
        manualUpGB: '1200',
        manualDownGB: '400',
        manualSeeds: '42'
      };
      const stats = manualStats(cfg);
      expect(stats.uploaded).toBe(1200 * 1024 ** 3);
      expect(stats.downloaded).toBe(400 * 1024 ** 3);
      expect(stats.ratio).toBe(3); // 1200 / 400 = 3.0
      expect(stats.seeding).toBe(42);
      expect(stats.buffer).toBe(stats.uploaded - stats.downloaded);
    });
  });

  describe('resolveTrackerConn', () => {
    it('resolves explicit baseUrl and apiKey from config', () => {
      const indexer = { id: 10, indexerUrls: ['https://prowlarr.default/'] };
      const cfg = {
        baseUrl: 'https://tracker.custom/api',
        apiKey: 'secret_token_123'
      };
      const res = resolveTrackerConn(indexer, cfg);
      expect(res.baseUrl).toBe('https://tracker.custom/api');
      expect(res.apiKey).toBe('secret_token_123');
    });

    it('falls back to indexer fields when config fields are empty', () => {
      const indexer = {
        id: 20,
        indexerUrls: ['https://tracker.fallback/'],
        fields: [
          { name: 'baseurl', value: 'https://tracker.fromfield/' },
          { name: 'apikey', value: 'field_key_abc' }
        ]
      };
      const cfg = {
        baseUrl: '',
        apiKey: ''
      };
      const res = resolveTrackerConn(indexer, cfg);
      expect(res.baseUrl).toBe('https://tracker.fromfield/');
      expect(res.apiKey).toBe('field_key_abc');
    });
  });
});
