import { describe, it, expect } from 'vitest';
import { getTrackerLogo, getTrackerInitials } from '../src/lib/logos.js';

describe('logos helper', () => {
  it('returns appropriate logo for known trackers', () => {
    expect(getTrackerLogo('Astra')).toBe('/logos/astra.png');
    expect(getTrackerLogo('Draupnirr')).toBe('/logos/draupnirr.ico');
    expect(getTrackerLogo('C411')).toBe('/logos/c411.ico');
    expect(getTrackerLogo('YggTorrent')).toBe('/logos/yggtorrent.png');
    expect(getTrackerLogo('CrazySpirits')).toBe('/logos/crazyspirits.png');
    expect(getTrackerLogo('SpeedApp')).toBe('/logos/speedapp.png');
  });

  it('accepts indexer objects with name or indexerUrls', () => {
    expect(getTrackerLogo({ name: 'Mon Tracker Astra' })).toBe('/logos/astra.png');
    expect(getTrackerLogo({ name: 'SpeedApp HD' })).toBe('/logos/speedapp.png');
  });

  it('returns null for unknown trackers with no URL', () => {
    expect(getTrackerLogo('MonTrackerInconnuXYZ')).toBeNull();
    expect(getTrackerLogo('')).toBeNull();
    expect(getTrackerLogo(null)).toBeNull();
  });

  it('computes 2-letter uppercase initials properly', () => {
    expect(getTrackerInitials('YggTorrent')).toBe('YG');
    expect(getTrackerInitials('The Old School')).toBe('TO');
    expect(getTrackerInitials('Astra Tracker')).toBe('AT');
    expect(getTrackerInitials('X')).toBe('X');
    expect(getTrackerInitials('')).toBe('?');
    expect(getTrackerInitials(null)).toBe('?');
  });
});
