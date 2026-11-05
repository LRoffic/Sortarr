import { json } from '@sveltejs/kit';
import { syncAllTags } from '$lib/arr.server.js';

export async function POST({ request }) {
  try {
    let bodyConfig = {};
    try {
      const body = await request.json();
      if (body && typeof body === 'object') {
        bodyConfig = body;
      }
    } catch {}

    // Une synchronisation déclenchée manuellement force l'activation du marquage
    bodyConfig.taggingEnabled = true;

    const report = await syncAllTags(null, bodyConfig);
    return json(report);
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}
