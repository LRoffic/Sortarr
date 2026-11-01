import { json } from '@sveltejs/kit';
import {
  startTotpSetup,
  confirmTotpSetup,
  disableTotp,
  saveRecaptchaSettings,
  getSecuritySettings,
  changePassword
} from '$lib/auth.server.js';

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'change-password') {
      if (body.newPassword !== body.confirmPassword) {
        throw new Error('Les nouveaux mots de passe ne correspondent pas');
      }
      changePassword(locals.user.username, body.currentPassword, body.newPassword);
      return json({ ok: true });
    }

    if (action === 'setup') {
      const { secret, otpauthUri } = startTotpSetup(locals.user.username);
      return json({ ok: true, secret, otpauthUri });
    }

    if (action === 'confirm') {
      const { backupCodes } = confirmTotpSetup(locals.user.username, body.code);
      return json({
        ok: true,
        backupCodes,
        security: getSecuritySettings(locals.user.username)
      });
    }

    if (action === 'disable') {
      disableTotp(locals.user.username, body.codeOrPassword);
      return json({
        ok: true,
        security: getSecuritySettings(locals.user.username)
      });
    }

    if (action === 'save-recaptcha') {
      saveRecaptchaSettings(body.siteKey, body.secretKey);
      return json({
        ok: true,
        security: getSecuritySettings(locals.user.username)
      });
    }

    return json({ ok: false, error: 'Action inconnue' }, { status: 400 });
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
}
