import { getConfig } from './config.server.js';
import { fetchIndexers, fetchTags } from './prowlarr.server.js';
import { getTrackerStats } from './tracker.server.js';
import { recordDailyStats, getLatestRecordedStats } from './history.server.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // indexerId -> { at, key, stats }

let lastKnownTagMap = new Map();
let lastKnownNoArrTagId = null;

/** Indexeurs Prowlarr + stats réelles des trackers configurés. */
export async function getEnrichedIndexers({ force = false } = {}) {
  const config = getConfig();
  const [indexers, tags] = await Promise.all([
    fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey),
    fetchTags(config.prowlarrUrl, config.prowlarrApiKey).catch(() => [])
  ]);
  indexers.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  const tagMap = new Map(lastKnownTagMap);
  let noArrTagId = lastKnownNoArrTagId;
  const configuredTag = String(config.taggingTag || 'no-arr').trim().toLowerCase();
  if (Array.isArray(tags) && tags.length > 0) {
    for (const t of tags) {
      if (t && t.id) {
        tagMap.set(t.id, t.label);
        lastKnownTagMap.set(t.id, t.label);
        if (String(t.label || '').trim().toLowerCase() === configuredTag) {
          noArrTagId = t.id;
          lastKnownNoArrTagId = t.id;
        }
      }
    }
  }

  const enriched = await Promise.all(
    indexers.map(async (idx) => {
      const currentTags = Array.isArray(idx.tags) ? idx.tags : [];
      const tagLabels = currentTags.map((id) => tagMap.get(id)).filter(Boolean);
      const hasNoArrTag = noArrTagId !== null
        ? currentTags.includes(noArrTagId)
        : tagLabels.some((l) => String(l || '').toLowerCase() === configuredTag);

      const baseItem = {
        ...idx,
        tags: currentTags,
        tagLabels,
        hasNoArrTag,
        taggingTag: config.taggingTag || 'no-arr'
      };

      const cfg = config.trackers?.[idx.id];
      if (!cfg && idx.privacy === 'public') return { ...baseItem, tracker: { public: true, freeleech: null } };
      if (!cfg || cfg.enabled === false) return { ...baseItem, tracker: null };
      const key = JSON.stringify([cfg, config.apiRatioUrl]);
      const hit = cache.get(idx.id);
      if (!force && hit && hit.key === key && Date.now() - hit.at < CACHE_TTL_MS) {
        return { ...baseItem, tracker: hit.stats };
      }
      const stats = await getTrackerStats(idx, cfg, { apiRatioUrl: config.apiRatioUrl });
      if (!stats.error) {
        cache.set(idx.id, { at: Date.now(), key, stats });
        return { ...baseItem, tracker: stats };
      }

      // Si la récupération directe échoue (session expirée, timeout, Cloudflare...),
      // on bascule sur le cache mémoire ou l'historique enregistré pour conserver le ratio réel
      // et éviter de désactiver la protection no-arr par inadvertance !
      if (hit && hit.stats && !hit.stats.error) {
        return {
          ...baseItem,
          tracker: {
            ...hit.stats,
            stale: true,
            fetchError: stats.error
          }
        };
      }

      const latestHistory = getLatestRecordedStats(idx.id);
      if (latestHistory && typeof latestHistory.ratio === 'number') {
        return {
          ...baseItem,
          tracker: {
            uploaded: latestHistory.uploaded,
            downloaded: latestHistory.downloaded,
            ratio: latestHistory.ratio,
            buffer: latestHistory.buffer,
            points: latestHistory.points,
            pointsLabel: latestHistory.pointsLabel,
            seeding: latestHistory.seeding,
            leeching: latestHistory.leeching,
            freeleech: latestHistory.freeleech,
            stale: true,
            fetchError: stats.error
          }
        };
      }

      return { ...baseItem, tracker: stats };
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
