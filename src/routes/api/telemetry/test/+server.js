import { json } from '@sveltejs/kit';
import { sendTelemetryPing, buildTelemetryPayload } from '$lib/telemetry.server.js';

/**
 * POST /api/telemetry/test — Envoie un ping de télémétrie de test pour valider la communication
 */
export async function POST() {
  const payload = buildTelemetryPayload({ isTest: true });
  const result = await sendTelemetryPing({ isTest: true, force: true });

  return json({
    ok: result.ok,
    status: result.status,
    payload,
    data: result.data,
    error: result.error
  });
}
