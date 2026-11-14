import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PALIERS,
  normalizePaliers,
  getEffectivePaliers,
  formatPalierGB,
  computeStatProgress
} from '../src/lib/paliers.js';

describe('Paliers logic & formatting', () => {
  it('has valid default paliers', () => {
    expect(DEFAULT_PALIERS.ratio).toBe(4.0);
    expect(DEFAULT_PALIERS.uploadGB).toBe(2048);
    expect(DEFAULT_PALIERS.downloadGB).toBe(2048);
    expect(DEFAULT_PALIERS.bufferGB).toBe(1024);
    expect(DEFAULT_PALIERS.points).toBe(25000);
    expect(DEFAULT_PALIERS.astra).toBe(1000);
    expect(DEFAULT_PALIERS.seeds).toBe(150);
  });

  it('normalizes paliers and falls back to defaults for invalid values', () => {
    const custom = normalizePaliers({
      ratio: '3.5',
      uploadGB: -10, // invalide -> fallback
      downloadGB: '4096',
      points: 50000,
      seeds: '80.6'
    });

    expect(custom.ratio).toBe(3.5);
    expect(custom.uploadGB).toBe(2048);
    expect(custom.downloadGB).toBe(4096);
    expect(custom.points).toBe(50000);
    expect(custom.seeds).toBe(81);
  });

  it('formats GB correctly into To or Go', () => {
    expect(formatPalierGB(2048)).toBe('2 To');
    expect(formatPalierGB(1024)).toBe('1 To');
    expect(formatPalierGB(500)).toBe('500 Go');
    expect(formatPalierGB(1536)).toBe('1.5 To');
    expect(formatPalierGB(0)).toBe('0 Go');
  });

  it('falls back to global paliers when the tracker has no overrides', () => {
    const config = {
      mode: 'global',
      global: { ratio: 5.0, uploadGB: 4096 }
    };

    const effective = getEffectivePaliers(12, config, { 12: {} });
    expect(effective.ratio).toBe(5.0);
    expect(effective.uploadGB).toBe(4096);
  });

  it('always applies per-tracker paliers regardless of the legacy mode flag', () => {
    const trackers = { 12: { paliers: { ratio: 2.0 } } };

    expect(getEffectivePaliers(12, { mode: 'global', global: { ratio: 5.0 } }, trackers).ratio).toBe(2.0);
    expect(getEffectivePaliers(12, undefined, trackers).ratio).toBe(2.0);
  });

  it('uses tracker paliers when overrides exist, and falls back to global only when globalEnabled is true', () => {
    const configWithGlobal = {
      mode: 'tracker',
      globalEnabled: true,
      global: { ratio: 5.0, uploadGB: 4096 }
    };
    const trackers = {
      12: { paliers: { ratio: 2.5, bufferGB: 512 } },
      14: {} // Pas de paliers spécifiques -> fallback global si activé
    };

    const eff12 = getEffectivePaliers(12, configWithGlobal, trackers);
    expect(eff12.ratio).toBe(2.5);
    expect(eff12.bufferGB).toBe(512);
    expect(eff12.uploadGB).toBe(4096); // Fallback sur global activé

    const eff14 = getEffectivePaliers(14, configWithGlobal, trackers);
    expect(eff14.ratio).toBe(5.0);

    // Si globalEnabled est false, fallback sur DEFAULT_PALIERS
    const configWithoutGlobal = {
      mode: 'tracker',
      globalEnabled: false,
      global: { ratio: 5.0, uploadGB: 4096 }
    };
    expect(getEffectivePaliers(14, configWithoutGlobal, trackers).ratio).toBe(DEFAULT_PALIERS.ratio);
    expect(getEffectivePaliers(12, configWithoutGlobal, trackers).ratio).toBe(2.5);
    expect(getEffectivePaliers(12, configWithoutGlobal, trackers).uploadGB).toBe(DEFAULT_PALIERS.uploadGB);
  });

  it('computes progress percentages and bar widths properly', () => {
    const progress = computeStatProgress({
      ratio: 2.0,
      uploaded: 1024 * 1024 ** 3, // 1024 Go = 1 To
      downloaded: 512 * 1024 ** 3,
      buffer: 512 * 1024 ** 3,
      points: 12500,
      astra: 500,
      seeds: 75,
      paliers: DEFAULT_PALIERS
    });

    // 2.0 / 4.0 = 50%
    expect(progress.ratio.pct).toBe(50);
    expect(progress.ratio.width).toBe(50);

    // 1 To / 2 To = 50%
    expect(progress.upload.pct).toBe(50);
    expect(progress.upload.targetStr).toBe('2 To');

    // 512 Go / 2048 Go = 25%
    expect(progress.download.pct).toBe(25);

    // 12500 / 25000 = 50%
    expect(progress.points.pct).toBe(50);

    // 500 / 1000 = 50%
    expect(progress.astra.pct).toBe(50);

    // 75 / 150 = 50%
    expect(progress.seeds.pct).toBe(50);
  });

  it('handles infinite trackers gracefully', () => {
    const progress = computeStatProgress({
      ratio: null,
      uploaded: 100,
      downloaded: 100,
      buffer: null,
      isInfinite: true
    });

    expect(progress.ratio.width).toBe(100);
    expect(progress.ratio.tooltip).toContain('∞');
    expect(progress.buffer.width).toBe(100);
  });
});
