import { json } from '@sveltejs/kit';
import { getConfig } from '$lib/config.server.js';
import { fetchIndexers } from '$lib/prowlarr.server.js';
import { getTrackerStats } from '$lib/tracker.server.js';

/** Teste la config d'un tracker sans la sauvegarder. */
export async function POST({ request }) {
  const { indexerId, tracker, apiRatioUrl } = await request.json();
  const config = getConfig();
  const startMs = Date.now();
  try {
    const indexers = await fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey);
    const idx = indexers.find((i) => i.id === indexerId);
    if (!idx) return json({ ok: false, error: 'Indexeur introuvable' }, { status: 404 });
    const raw = await getTrackerStats(idx, tracker ?? {}, {
      apiRatioUrl: apiRatioUrl ?? config.apiRatioUrl,
      debug: true
    });
    const { debugLogs = [], ...stats } = raw;
    const durationMs = Date.now() - startMs;
    if (stats.error) {
      return json({
        ok: false,
        error: stats.error,
        indexerName: idx.name,
        connectorType: tracker?.type || 'unit3d',
        durationMs,
        debugLogs
      });
    }
    return json({
      ok: true,
      stats,
      indexerName: idx.name,
      connectorType: tracker?.type || 'unit3d',
      durationMs,
      debugLogs
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: e.message,
        durationMs: Date.now() - startMs,
        debugLogs: []
      },
      { status: 500 }
    );
  }
}
