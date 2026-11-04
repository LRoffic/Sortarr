import { json } from '@sveltejs/kit';
import { syncAllTags } from '$lib/arr.server.js';

export async function POST() {
  try {
    const report = await syncAllTags();
    return json(report);
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 });
  }
}
