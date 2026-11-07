import { describe, it, expect } from 'vitest';
import {
  getNormalizedOs,
  isDockerEnvironment,
  getGitBranch,
  buildTelemetryPayload,
  sendTelemetryPing,
  TELEMETRY_URL
} from '../src/lib/telemetry.server.js';
import { getConfig } from '../src/lib/config.server.js';
import { getCurrentVersion } from '../src/lib/updater.server.js';

describe('telemetry service', () => {
  it('has valid telemetry endpoint URL', () => {
    expect(TELEMETRY_URL).toBe('https://tele-sortarr.lripsum.net/api/v1/telemetry');
  });

  it('normalizes OS correctly', () => {
    const osName = getNormalizedOs();
    expect(['windows', 'linux', 'macos']).toContain(osName);
  });

  it('detects Docker environment as boolean', () => {
    const isDocker = isDockerEnvironment();
    expect(typeof isDocker).toBe('boolean');
  });

  it('detects git branch as string', () => {
    const branch = getGitBranch();
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  it('builds anonymous telemetry payload matching expected schema', () => {
    const cfg = getConfig();
    const payload = buildTelemetryPayload({ isTest: false });

    expect(payload).toBeDefined();
    expect(payload.instance_id).toBe(cfg.instanceId);
    expect(payload.instance_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(payload.version).toBe(getCurrentVersion());
    expect(typeof payload.os).toBe('string');
    expect(typeof payload.arch).toBe('string');
    expect(typeof payload.is_docker).toBe('boolean');
    expect(typeof payload.branch).toBe('string');
    expect(payload.is_test).toBe(false);
  });

  it('handles sendTelemetryPing gracefully without throwing errors even on network failure or 502', async () => {
    const res = await sendTelemetryPing({ isTest: true, force: true });
    expect(res).toBeDefined();
    expect(typeof res.ok).toBe('boolean');
  }, 15000);
});
