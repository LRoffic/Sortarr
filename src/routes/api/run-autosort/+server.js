import { json } from '@sveltejs/kit';
import { runAutoSort } from '$lib/scheduler.server.js';

/** Manual trigger of one auto-sort cycle */
export async function POST() {
  const result = await runAutoSort();
  return json(result);
}
