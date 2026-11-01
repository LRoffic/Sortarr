import { json } from '@sveltejs/kit';
import { checkForUpdates, performUpdate } from '$lib/updater.server.js';

/** GET /api/update?force=1 — Vérifie si une nouvelle release est disponible sur GitHub */
export async function GET({ url }) {
  const force = url.searchParams.get('force') === '1';
  const status = await checkForUpdates({ force });
  return json(status);
}

/** POST /api/update — Télécharge et installe la dernière release depuis GitHub */
export async function POST() {
  try {
    const result = await performUpdate();
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}
