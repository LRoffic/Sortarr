import { json } from '@sveltejs/kit';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  verifyPending2FAToken,
  verifyUserTotpOrBackup,
  createSessionToken,
  SESSION_COOKIE
} from '$lib/auth.server.js';

export async function POST({ request, cookies, getClientAddress }) {
  let ip = 'unknown';
  try {
    ip = getClientAddress();
  } catch {}

  try {
    checkRateLimit(ip);
    const { pendingToken, code } = await request.json();
    const username = verifyPending2FAToken(pendingToken);
    if (!username) {
      return json(
        { ok: false, error: 'Session de vérification 2FA expirée. Veuillez vous reconnecter.' },
        { status: 401 }
      );
    }

    if (!verifyUserTotpOrBackup(username, code)) {
      recordFailedAttempt(ip);
      return json(
        { ok: false, error: 'Code 2FA (ou code de secours) invalide.' },
        { status: 401 }
      );
    }

    clearFailedAttempts(ip);
    const token = createSessionToken(username);
    cookies.set(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 30 * 24 * 3600
    });
    return json({ ok: true, username });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
