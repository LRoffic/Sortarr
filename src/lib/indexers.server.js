import { getConfig } from './config.server.js';
import { fetchIndexers } from './prowlarr.server.js';
import { getTrackerStats } from './tracker.server.js';
import { recordDailyStats } from './history.server.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // indexerId -> { at, key, stats }

/** Indexeurs Prowlarr + stats réelles des trackers configurés. */
export async function getEnrichedIndexers({ force = false } = {}) {
  const config = getConfig();
  const indexers = await fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey);
  indexers.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  const enriched = await Promise.all(
    indexers.map(async (idx) => {
      const cfg = config.trackers?.[idx.id];
      if (!cfg && idx.privacy === 'public') return { ...idx, tracker: { public: true, freeleech: null } };
      if (!cfg || cfg.enabled === false) return { ...idx, tracker: null };
      const key = JSON.stringify([cfg, config.apiRatioUrl]);
      const hit = cache.get(idx.id);
      if (!force && hit && hit.key === key && Date.now() - hit.at < CACHE_TTL_MS) {
        return { ...idx, tracker: hit.stats };
      }
      const stats = await getTrackerStats(idx, cfg, { apiRatioUrl: config.apiRatioUrl });
      if (!stats.error) cache.set(idx.id, { at: Date.now(), key, stats });
      return { ...idx, tracker: stats };
    })
  );

  try {
    recordDailyStats(enriched);
  } catch {
    // ignore history write errors
  }

  return enriched;
}

/** Version sans `fields` (contient des clés API) pour le navigateur. */
export function toPublic(indexers) {
  return indexers.map(({ fields, ...rest }) => rest);
}
