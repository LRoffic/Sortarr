import { describe, it, expect } from 'vitest';
import { shouldTagIndexer } from '../src/lib/arr.server.js';

const GB = 1024 ** 3;

const baseConfig = {
  taggingRatioThreshold: 1.0,
  taggingExcludeFreeleech: true,
  taggingStopOnBuffer: true,
  taggingBufferThresholdGb: 50
};

const makeIdx = (tracker = {}) => ({ id: 1, name: 'T', privacy: 'private', tracker });

describe('tagging — stop download sur buffer', () => {
  it('tags when buffer is below threshold even if ratio is sufficient', () => {
    const res = shouldTagIndexer(makeIdx({ ratio: 3, buffer: 10 * GB }), baseConfig);
    expect(res.shouldTag).toBe(true);
    expect(res.reason).toMatch(/Buffer insuffisant/);
  });

  it('does not tag when buffer is above threshold and ratio is sufficient', () => {
    const res = shouldTagIndexer(makeIdx({ ratio: 3, buffer: 200 * GB }), baseConfig);
    expect(res.shouldTag).toBe(false);
  });

  it('ignores buffer when option is disabled', () => {
    const res = shouldTagIndexer(
      makeIdx({ ratio: 3, buffer: 1 * GB }),
      { ...baseConfig, taggingStopOnBuffer: false }
    );
    expect(res.shouldTag).toBe(false);
  });

  it('tags on low buffer when ratio is unknown', () => {
    const res = shouldTagIndexer(makeIdx({ buffer: 5 * GB }), baseConfig);
    expect(res.shouldTag).toBe(true);
  });

  it('never tags infinite-ratio or freeleech-exempt trackers', () => {
    expect(shouldTagIndexer(makeIdx({ infinite: true, buffer: 0 }), baseConfig).shouldTag).toBe(false);
    expect(shouldTagIndexer(makeIdx({ freeleech: true, ratio: 3, buffer: 0 }), baseConfig).shouldTag).toBe(false);
  });
});
