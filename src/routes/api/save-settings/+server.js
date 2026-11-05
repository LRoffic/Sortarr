import { json } from '@sveltejs/kit';
import { saveConfig } from '$lib/config.server.js';
import { testConnection } from '$lib/prowlarr.server.js';
import { restartScheduler } from '$lib/scheduler.server.js';
import { settingsSchema, validateForm } from '$lib/validation.js';

export async function POST({ request }) {
  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return json({ ok: false, error: 'Requête invalide' }, { status: 400 });
  }

  const validation = await validateForm(settingsSchema, rawBody);
  if (!validation.valid) {
    return json({ ok: false, error: validation.firstError, errors: validation.errors }, { status: 400 });
  }
  const body = rawBody;

  const prowlarrUrl = String(body.prowlarrUrl ?? '').trim().replace(/\/+$/, '');
  const prowlarrApiKey = String(body.prowlarrApiKey ?? '').trim();
  const autoRefreshInterval = Math.max(5, parseInt(body.autoRefreshInterval) || 20);
  const autoSortEnabled = body.autoSortEnabled === true;
  const autoSortInterval = Math.max(5, parseInt(body.autoSortInterval) || 20);

  const taggingEnabled = body.taggingEnabled === true;
  const taggingTag = String(body.taggingTag ?? 'no-arr').trim() || 'no-arr';
  const taggingRatioThreshold = typeof body.taggingRatioThreshold === 'number'
    ? body.taggingRatioThreshold
    : parseFloat(body.taggingRatioThreshold) || 1.0;
  const taggingExcludeFreeleech = body.taggingExcludeFreeleech !== false;
  const radarrUrl = String(body.radarrUrl ?? '').trim().replace(/\/+$/, '');
  const radarrApiKey = String(body.radarrApiKey ?? '').trim();
  const sonarrUrl = String(body.sonarrUrl ?? '').trim().replace(/\/+$/, '');
  const sonarrApiKey = String(body.sonarrApiKey ?? '').trim();

  if (!body.skipTest) {
    if (!prowlarrUrl) return json({ ok: false, error: "L'URL Prowlarr est requise" }, { status: 400 });
    if (!/^https?:\/\//i.test(prowlarrUrl)) {
      return json({ ok: false, error: "L'URL doit commencer par http:// ou https://" }, { status: 400 });
    }
    if (!prowlarrApiKey) return json({ ok: false, error: 'La clé API est requise' }, { status: 400 });
  }

  try {
    const trackers = {};
    for (const [id, t] of Object.entries(body.trackers ?? {})) {
      let finalApiKey = String(t.apiKey ?? '').trim();
      const crazyUid = String(t.crazyUid ?? '').replace(/^uid=/i, '').trim();
      const crazyPass = String(t.crazyPass ?? '').replace(/^pass=/i, '').trim();
      const yggCfClearance = String(t.yggCfClearance ?? '').replace(/^cf_clearance=/i, '').trim();

      if (t.type === 'crazyspirits' && crazyUid && crazyPass) {
        finalApiKey = `uid=${crazyUid}; pass=${crazyPass}`;
      } else if (t.type === 'yggreborn') {
        if (finalApiKey && !finalApiKey.includes('__ygg_sess=') && !finalApiKey.includes('http')) {
          finalApiKey = `__ygg_sess=${finalApiKey}`;
        }
        if (yggCfClearance && !finalApiKey.includes('cf_clearance=')) {
          finalApiKey = `${finalApiKey}; cf_clearance=${yggCfClearance}`;
        }
      } else if (t.type === 'nostradamus') {
        if (finalApiKey && !finalApiKey.includes('_nostradamus_key=')) {
          finalApiKey = `_nostradamus_key=${finalApiKey}`;
        }
      }

      trackers[id] = {
        enabled: t.enabled === true,
        type: [
          'manual', 'public', 'c411', 'custom', 'apiratio', 'tr4ker',
          'draupnirr', 'astra', 'crazyspirits', 'nostradamus', 'yggreborn', 'v3x',
          'speedapp', 'teamflix'
        ].includes(t.type)
          ? t.type
          : 'unit3d',
        apiRatioKey: String(t.apiRatioKey ?? '').trim(),
        authMode: ['bearer', 'xapikey', 'apikey', 'api_token'].includes(t.authMode) ? t.authMode : 'bearer',
        pathUp: String(t.pathUp ?? '').trim(),
        pathDown: String(t.pathDown ?? '').trim(),
        pathRatio: String(t.pathRatio ?? '').trim(),
        pathPoints: String(t.pathPoints ?? '').trim(),
        pathFl: String(t.pathFl ?? '').trim(),
        baseUrl: String(t.baseUrl ?? '').trim().replace(/\/+$/, ''),
        apiKey: finalApiKey,
        crazyUid,
        crazyPass,
        yggCfClearance,
        freeleech: ['on', 'off'].includes(t.freeleech) ? t.freeleech : 'auto',
        manualUpGB: t.manualUpGB ?? '',
        manualDownGB: t.manualDownGB ?? '',
        manualAstra: t.manualAstra ?? ''
      };
    }
    saveConfig({
      prowlarrUrl,
      prowlarrApiKey,
      autoRefreshInterval,
      autoSortEnabled,
      autoSortInterval,
      taggingEnabled,
      taggingTag,
      taggingRatioThreshold,
      taggingExcludeFreeleech,
      radarrUrl,
      radarrApiKey,
      sonarrUrl,
      sonarrApiKey,
      trackers,
      apiRatioUrl: String(body.apiRatioUrl ?? '').trim().replace(/\/+$/, ''),
      telemetryEnabled: body.telemetryEnabled !== false
    });
  } catch (e) {
    return json({ ok: false, error: `Écriture de la configuration impossible : ${e.message}` }, { status: 500 });
  }

  restartScheduler();
  if (body.skipTest) {
    return json({ ok: true, autoSaved: true });
  }
  const test = await testConnection(prowlarrUrl, prowlarrApiKey);
  return json({ ok: true, connectionOk: test.ok, version: test.version, testError: test.error });
}
