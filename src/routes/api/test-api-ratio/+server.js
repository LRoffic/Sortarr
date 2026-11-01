import { json } from '@sveltejs/kit';
import { testApiRatioConnection } from '$lib/tracker.server.js';

export async function POST({ request }) {
  const { apiRatioUrl } = await request.json();
  if (!apiRatioUrl || !apiRatioUrl.trim()) {
    return json({ ok: false, error: 'URL api-ratio requise (ex: http://localhost:8679)' }, { status: 400 });
  }
  const result = await testApiRatioConnection(apiRatioUrl.trim());
  return json(result);
}
