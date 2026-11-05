import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { touchRestartFile, initServerLifecycle } from '../src/lib/lifecycle.server.js';
import { clearUpdateCache } from '../src/lib/updater.server.js';
import { stopScheduler, restartScheduler, getSchedulerStatus } from '../src/lib/scheduler.server.js';

describe('lifecycle & hot-restart', () => {
  it('creates or touches tmp/restart.txt successfully', () => {
    touchRestartFile();
    const restartFile = path.resolve('tmp', 'restart.txt');
    expect(fs.existsSync(restartFile)).toBe(true);
    const content = fs.readFileSync(restartFile, 'utf-8').trim();
    expect(Number(content)).toBeGreaterThan(0);
  });

  it('initializes server lifecycle listeners without throwing', () => {
    expect(() => initServerLifecycle()).not.toThrow();
  });

  it('stops and restarts the background scheduler cleanly', () => {
    stopScheduler();
    const statusStopped = getSchedulerStatus();
    expect(statusStopped.running).toBe(false);

    restartScheduler();
    const statusStarted = getSchedulerStatus();
    expect(statusStarted).toBeDefined();
  });

  it('clears updater caches safely without error', () => {
    expect(() => clearUpdateCache()).not.toThrow();
  });
});
