import { json } from '@sveltejs/kit';
import { getConfig } from '$lib/config.server.js';
import { fetchIndexerStats } from '$lib/prowlarr.server.js';

export async function GET() {
  const config = getConfig();
  if (!config.prowlarrApiKey) return json({ error: 'No config' }, { status: 400 });
  try {
    const stats = await fetchIndexerStats(config.prowlarrUrl, config.prowlarrApiKey);
    return json(stats ?? {});
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
