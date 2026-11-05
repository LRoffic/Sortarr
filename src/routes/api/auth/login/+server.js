import { json } from '@sveltejs/kit';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  verifyCaptchaResponse,
  verifyUser,
  createPending2FAToken,
  createSessionToken,
  setSessionCookie
} from '$lib/auth.server.js';
import { loginSchema, validateForm } from '$lib/validation.js';

export async function POST({ request, cookies, getClientAddress }) {
  let ip = 'unknown';
  try {
    ip = getClientAddress();
  } catch {}

  try {
    checkRateLimit(ip);
    const body = await request.json();
    const validation = await validateForm(loginSchema, body);
    if (!validation.valid) {
      return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
    }

    const { username, password, recaptchaToken, captchaToken, captchaAnswer } = validation.data;

    // 1. Vérifier le reCAPTCHA (Google v2 ou intégré)
    await verifyCaptchaResponse({ recaptchaToken, captchaToken, captchaAnswer, ip });

    // 2. Vérifier identifiant + mot de passe
    const user = verifyUser(username, password);
    if (!user) {
      recordFailedAttempt(ip);
      return json({ ok: false, error: 'Identifiant ou mot de passe incorrect' }, { status: 401 });
    }

    clearFailedAttempts(ip);

    // 3. Si la double authentification (2FA) est activée -> étape 2 requise
    if (user.totpEnabled) {
      const pendingToken = createPending2FAToken(user.username);
      return json({
        ok: true,
        requires2FA: true,
        pendingToken,
        username: user.username
      });
    }

    // 4. Sinon, ouvrir la session directement
    const token = createSessionToken(user.username);
    setSessionCookie(cookies, token, request);
    return json({ ok: true, requires2FA: false, username: user.username });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
