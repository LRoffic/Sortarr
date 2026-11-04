import { json } from '@sveltejs/kit';
import { getPublicRecaptchaConfig, generateBuiltinCaptcha } from '$lib/auth.server.js';

export async function GET() {
  const recaptcha = getPublicRecaptchaConfig();
  if (recaptcha.mode === 'disabled') {
    return json({ ok: true, mode: 'disabled' });
  }
  if (recaptcha.mode === 'google') {
    return json({ ok: true, mode: 'google', siteKey: recaptcha.siteKey });
  }
  const { token, svg } = generateBuiltinCaptcha();
  return json({ ok: true, mode: 'builtin', token, svg });
}
