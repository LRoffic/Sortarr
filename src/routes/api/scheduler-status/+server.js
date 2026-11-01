import { json } from '@sveltejs/kit';
import { getSchedulerStatus } from '$lib/scheduler.server.js';

export async function GET() {
  return json(getSchedulerStatus());
}
