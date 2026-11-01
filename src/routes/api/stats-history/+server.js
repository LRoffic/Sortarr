import { json } from '@sveltejs/kit';
import { getConfig } from '$lib/config.server.js';
import { getEnrichedIndexers } from '$lib/indexers.server.js';
import { getFormattedStatsHistory } from '$lib/history.server.js';

export async function GET() {
  try {
    const history = getFormattedStatsHistory();
    return json({ ok: true, ...history });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const config = getConfig();
    let indexers = [];
    if (config.prowlarrApiKey) {
      indexers = await getEnrichedIndexers({ force: true });
    }
    const history = getFormattedStatsHistory(indexers);
    return json({ ok: true, ...history });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}
