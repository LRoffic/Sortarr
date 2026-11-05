import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers } from '$lib/indexers.server.js';
import { getFormattedStatsHistory } from '$lib/history.server.js';
import { DEFAULT_PALIERS } from '$lib/paliers.js';

export async function load() {
  const config = getConfig();
  let indexers = [];
  let error = null;

  if (config.prowlarrApiKey) {
    try {
      indexers = await getEnrichedIndexers({ force: false });
    } catch (e) {
      error = e.message;
    }
  }

  const history = getFormattedStatsHistory(indexers);
  const statsPaliers = config.statsPaliers || { mode: 'global', global: DEFAULT_PALIERS };
  const trackerPaliersMap = {};
  for (const [id, t] of Object.entries(config.trackers || {})) {
    if (t?.paliers) {
      trackerPaliersMap[id] = { paliers: t.paliers };
    }
  }

  return {
    configured: !!config.prowlarrApiKey,
    error,
    trackers: history.trackers,
    datesDesc: history.datesDesc,
    statsPaliers,
    trackerPaliersMap
  };
}
