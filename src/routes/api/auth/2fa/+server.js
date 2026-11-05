import { json } from '@sveltejs/kit';
import {
  startTotpSetup,
  confirmTotpSetup,
  disableTotp,
  saveRecaptchaSettings,
  getSecuritySettings,
  changePassword
} from '$lib/auth.server.js';
import {
  changePasswordSchema,
  totpConfirmSchema,
  totpDisableSchema,
  recaptchaSettingsSchema,
  validateForm
} from '$lib/validation.js';

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'change-password') {
      const validation = await validateForm(changePasswordSchema, body);
      if (!validation.valid) {
        return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
      }
      changePassword(locals.user.username, validation.data.currentPassword, validation.data.newPassword);
      return json({ ok: true });
    }

    if (action === 'setup') {
      const { secret, otpauthUri } = startTotpSetup(locals.user.username);
      return json({ ok: true, secret, otpauthUri });
    }

    if (action === 'confirm') {
      const validation = await validateForm(totpConfirmSchema, body);
      if (!validation.valid) {
        return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
      }
      const { backupCodes } = confirmTotpSetup(locals.user.username, validation.data.code);
      return json({
        ok: true,
        backupCodes,
        security: getSecuritySettings(locals.user.username)
      });
    }

    if (action === 'disable') {
      const validation = await validateForm(totpDisableSchema, body);
      if (!validation.valid) {
        return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
      }
      disableTotp(locals.user.username, validation.data.codeOrPassword);
      return json({
        ok: true,
        security: getSecuritySettings(locals.user.username)
      });
    }

    if (action === 'save-recaptcha') {
      const validation = await validateForm(recaptchaSettingsSchema, body);
      if (!validation.valid) {
        return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
      }
      saveRecaptchaSettings(
        validation.data.siteKey,
        validation.data.secretKey,
        validation.data.captchaDisabled
      );
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
