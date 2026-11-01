import { json } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/auth.server.js';

export async function POST({ cookies }) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return json({ ok: true });
}
