import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers } from '$lib/indexers.server.js';
import { getFormattedStatsHistory } from '$lib/history.server.js';

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

  return {
    configured: !!config.prowlarrApiKey,
    error,
    trackers: history.trackers,
    datesDesc: history.datesDesc
  };
}
