import { json } from '@sveltejs/kit';
import { hasUsers, createUser, createSessionToken, setSessionCookie } from '$lib/auth.server.js';
import { registerSchema, validateForm } from '$lib/validation.js';

export async function POST({ request, cookies }) {
  try {
    if (hasUsers()) {
      return json({ ok: false, error: 'Un compte existe déjà. Veuillez vous connecter.' }, { status: 403 });
    }
    const body = await request.json();
    const validation = await validateForm(registerSchema, body);
    if (!validation.valid) {
      return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
    }

    const { username, password } = validation.data;
    const user = createUser(username, password);
    const token = createSessionToken(user.username);
    setSessionCookie(cookies, token, request);
    return json({ ok: true, username: user.username });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
