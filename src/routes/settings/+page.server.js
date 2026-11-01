import { getConfig } from '$lib/config.server.js';
import { fetchIndexers } from '$lib/prowlarr.server.js';
import { getSecuritySettings } from '$lib/auth.server.js';

export const load = async ({ locals }) => {
  const config = getConfig();
  let indexers = [];
  let indexersError = null;
  if (config.prowlarrApiKey) {
    try {
      const all = await fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey);
      indexers = all
        .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
        .map((i) => ({ id: i.id, name: i.name, privacy: i.privacy }));
    } catch (e) {
      indexersError = e.message;
    }
  }
  const security = getSecuritySettings(locals.user?.username);
  return { config, indexers, indexersError, security };
};
