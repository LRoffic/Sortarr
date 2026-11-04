import { json } from '@sveltejs/kit';
import { getConfig } from '$lib/config.server.js';
import { fetchIndexers, updateIndexerPriority } from '$lib/prowlarr.server.js';
import { syncAllTags } from '$lib/arr.server.js';

export async function POST({ request }) {
  const config = getConfig();
  if (!config.prowlarrApiKey) {
    return json({ message: 'No API key configured' }, { status: 400 });
  }

  let priorities;
  try {
    const body = await request.json();
    priorities = body.priorities; // [{ id, priority }]
  } catch {
    return json({ message: 'Invalid request body' }, { status: 400 });
  }

  try {
    // Fetch full indexer objects first
    const allIndexers = await fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey);
    const indexerMap = {};
    for (const idx of allIndexers) {
      indexerMap[idx.id] = idx;
    }

    const results = [];
    const errors = [];

    for (const { id, priority } of priorities) {
      const indexer = indexerMap[id];
      if (!indexer) {
        errors.push(`Indexeur ID ${id} non trouvé`);
        continue;
      }
      try {
        await updateIndexerPriority(config.prowlarrUrl, config.prowlarrApiKey, {
          ...indexer,
          priority
        });
        results.push(id);
      } catch (e) {
        errors.push(e.message);
      }
    }

    let tagReport = null;
    if (config.taggingEnabled) {
      try {
        tagReport = await syncAllTags();
      } catch (te) {
        errors.push(`Erreur sync tags: ${te.message}`);
      }
    }

    return json({
      updated: results.length,
      errors,
      ok: errors.length === 0,
      tagReport
    });
  } catch (e) {
    return json({ message: e.message }, { status: 500 });
  }
}
