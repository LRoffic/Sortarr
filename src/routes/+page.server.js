import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers, toPublic } from '$lib/indexers.server.js';

export const load = async () => {
  const config = getConfig();

  if (!config.prowlarrApiKey) {
    return { indexers: [], config: { autoSortEnabled: false }, error: 'no_config' };
  }

  try {
    const indexers = toPublic(await getEnrichedIndexers());
    return { indexers, error: null };
  } catch (e) {
    return { indexers: [], error: e.message };
  }
};
