import { json } from '@sveltejs/kit';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  verifyPending2FAToken,
  verifyUserTotpOrBackup,
  createSessionToken,
  setSessionCookie
} from '$lib/auth.server.js';
import { verify2FASchema, validateForm } from '$lib/validation.js';

export async function POST({ request, cookies, getClientAddress }) {
  let ip = 'unknown';
  try {
    ip = getClientAddress();
  } catch {}

  try {
    checkRateLimit(ip);
    const body = await request.json();
    const validation = await validateForm(verify2FASchema, body);
    if (!validation.valid) {
      return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
    }
    const { pendingToken, code } = validation.data;
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
    setSessionCookie(cookies, token, request);
    return json({ ok: true, username });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
