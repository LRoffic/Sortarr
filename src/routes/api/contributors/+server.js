import { json } from '@sveltejs/kit';
import { getContributors } from '$lib/updater.server.js';

/** GET /api/contributors?force=1 — Récupère la liste des contributeurs GitHub du dépôt */
export async function GET({ url }) {
  const force = url.searchParams.get('force') === '1';
  const data = await getContributors({ force });
  return json(data);
}
