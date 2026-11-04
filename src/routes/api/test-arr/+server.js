import { json } from '@sveltejs/kit';
import { testArrConnection } from '$lib/arr.server.js';

export async function POST({ request }) {
  try {
    const { url, apiKey, type } = await request.json();
    const result = await testArrConnection(url, apiKey, type || 'radarr');
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
