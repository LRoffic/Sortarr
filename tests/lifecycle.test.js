import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { touchRestartFile, initServerLifecycle, checkHotRestartSupport } from '../src/lib/lifecycle.server.js';
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

  it('detects hot-restart signal support (SIGHUP, SIGUSR1, SIGUSR2, Non supporté)', () => {
    const posixSupport = checkHotRestartSupport({
      platform: 'linux',
      osSignals: { SIGHUP: 1, SIGUSR1: 10, SIGUSR2: 12 },
      envSignal: ''
    });
    expect(posixSupport.supported).toBe(true);
    expect(posixSupport.signal).toBe('SIGHUP');
    expect(posixSupport.supportedSignals).toEqual(['SIGHUP', 'SIGUSR1', 'SIGUSR2']);

    const sigusr2Support = checkHotRestartSupport({
      platform: 'linux',
      osSignals: { SIGHUP: 1, SIGUSR1: 10, SIGUSR2: 12 },
      envSignal: 'SIGUSR2'
    });
    expect(sigusr2Support.supported).toBe(true);
    expect(sigusr2Support.signal).toBe('SIGUSR2');

    const disabledSupport = checkHotRestartSupport({
      platform: 'linux',
      osSignals: { SIGHUP: 1, SIGUSR1: 10, SIGUSR2: 12 },
      envSignal: 'Non supporté'
    });
    expect(disabledSupport.supported).toBe(false);
    expect(disabledSupport.label).toBe('Non supporté');

    const winSupport = checkHotRestartSupport({
      platform: 'win32',
      osSignals: { SIGHUP: 1 },
      envSignal: ''
    });
    expect(winSupport.supported).toBe(false);
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
