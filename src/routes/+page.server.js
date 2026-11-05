import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers, toPublic } from '$lib/indexers.server.js';
import { DEFAULT_PALIERS } from '$lib/paliers.js';

export const load = async () => {
  const config = getConfig();
  const statsPaliers = config.statsPaliers || { mode: 'global', global: DEFAULT_PALIERS };
  const trackerPaliersMap = {};
  for (const [id, t] of Object.entries(config.trackers || {})) {
    if (t?.paliers) {
      trackerPaliersMap[id] = { paliers: t.paliers };
    }
  }

  if (!config.prowlarrApiKey) {
    return {
      indexers: [],
      config: { autoSortEnabled: false },
      statsPaliers,
      trackerPaliersMap,
      error: 'no_config'
    };
  }

  try {
    const indexers = toPublic(await getEnrichedIndexers());
    return { indexers, statsPaliers, trackerPaliersMap, error: null };
  } catch (e) {
    return { indexers: [], statsPaliers, trackerPaliersMap, error: e.message };
  }
};
