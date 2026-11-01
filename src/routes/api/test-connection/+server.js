import { json } from '@sveltejs/kit';
import { testConnection } from '$lib/prowlarr.server.js';

export async function POST({ request }) {
  const { prowlarrUrl, prowlarrApiKey } = await request.json();
  if (!prowlarrUrl || !prowlarrApiKey) {
    return json({ ok: false, error: 'URL et clé API requis' }, { status: 400 });
  }
  const result = await testConnection(prowlarrUrl.trim().replace(/\/$/, ''), prowlarrApiKey.trim());
  return json(result);
}
