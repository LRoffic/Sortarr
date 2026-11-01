import { json } from '@sveltejs/kit';
import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers, toPublic } from '$lib/indexers.server.js';

export async function GET({ url }) {
  const config = getConfig();
  if (!config.prowlarrApiKey) {
    return json({ error: 'No API key configured' }, { status: 400 });
  }
  try {
    const indexers = await getEnrichedIndexers({ force: url.searchParams.get('force') === '1' });
    return json({ indexers: toPublic(indexers) });
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
