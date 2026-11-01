/**
 * Récupération des stats réelles (ratio, upload, download, points, freeleech)
 * directement auprès des trackers ou via api-ratio / Prometheus exporter.
 */
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { AsyncLocalStorage } from 'async_hooks';

const debugStorage = new AsyncLocalStorage();

function formatDebugBody(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2).slice(0, 8000);
    } catch {}
  }
  return trimmed.slice(0, 6000);
}

function pushDebugLog(entry) {
  const store = debugStorage.getStore();
  if (Array.isArray(store)) {
    store.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
  }
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const UNITS = {
  b: 1, o: 1, bo: 1,
  kb: 1024, ko: 1024, kib: 1024, kio: 1024,
  mb: 1024 ** 2, mo: 1024 ** 2, mib: 1024 ** 2, mio: 1024 ** 2,
  gb: 1024 ** 3, go: 1024 ** 3, gib: 1024 ** 3, gio: 1024 ** 3,
  tb: 1024 ** 4, to: 1024 ** 4, tib: 1024 ** 4, tio: 1024 ** 4,
  pb: 1024 ** 5, po: 1024 ** 5, pib: 1024 ** 5, pio: 1024 ** 5
};

/** "1.5 TiB" | "194,6 Go" | 12345 -> octets (number) ou null */
export function parseSize(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\u00a0/g, ' ').replace(/,/g, '.').trim().match(/^(-?[\d.]+)\s*([a-zA-Z]*)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase() || 'b';
  if (!Number.isFinite(n) || !(unit in UNITS)) return null;
  return n * UNITS[unit];
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/,/g, '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isFutureDate(v) {
  if (!v || typeof v !== 'string') return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && t > Date.now();
}

function buildStats({
  uploaded,
  downloaded,
  ratio,
  buffer,
  points,
  pointsLabel,
  pointsPerHour,
  flTokens,
  seeding,
  leeching,
  level,
  extraBadges,
  freeleech
}) {
  const infinite = downloaded === 0 || (downloaded === null && ratio === null && uploaded > 0);
  let r = ratio;
  if (r === null && uploaded !== null && downloaded) r = uploaded / downloaded;
  const buf = buffer !== undefined && buffer !== null
    ? buffer
    : uploaded !== null ? uploaded - (downloaded ?? 0) : null;
  return {
    uploaded,
    downloaded,
    ratio: infinite ? null : r,
    infinite: !!infinite,
    buffer: buf,
    points: points ?? null,
    pointsLabel: pointsLabel || 'POINTS',
    pointsPerHour: pointsPerHour ?? null,
    flTokens: flTokens ?? null,
    seeding: seeding ?? null,
    leeching: leeching ?? null,
    level: level ?? null,
    extraBadges: Array.isArray(extraBadges) ? extraBadges : [],
    freeleech: freeleech ?? null,
    fetchedAt: new Date().toISOString()
  };
}

/** Lit une valeur par chemin pointé : "transfer.uploaded.total" */
function getPath(obj, path) {
  if (!path) return undefined;
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

/**
 * Effectue une requête HTTP(S) tolérante aux chaînes de certificats SSL incomplètes
 * (ex: UNABLE_TO_VERIFY_LEAF_SIGNATURE sur crazyspirits.com) tout en suivant les redirections.
 */
function fetchWithTlsFallback(urlStr, { headers = {}, timeoutMs = 15000, maxRedirects = 5 } = {}) {
  const startMs = Date.now();
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      parsed,
      {
        method: 'GET',
        headers,
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).toString();
          pushDebugLog({
            method: 'GET',
            url: urlStr,
            requestHeaders: headers,
            status: res.statusCode,
            durationMs: Date.now() - startMs,
            tlsFallback: true,
            responsePreview: `Redirect -> ${nextUrl}`
          });
          resolve(
            fetchWithTlsFallback(nextUrl, {
              headers,
              timeoutMs,
              maxRedirects: maxRedirects - 1
            })
          );
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          pushDebugLog({
            method: 'GET',
            url: parsed.toString(),
            requestHeaders: headers,
            status: res.statusCode || 0,
            durationMs: Date.now() - startMs,
            tlsFallback: true,
            responsePreview: formatDebugBody(text)
          });
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            url: parsed.toString(),
            text: async () => text,
            json: async () => JSON.parse(text)
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout (${timeoutMs}ms) sur ${urlStr}`));
    });
    req.on('error', (err) => {
      pushDebugLog({
        method: 'GET',
        url: urlStr,
        requestHeaders: headers,
        status: 'ERR',
        durationMs: Date.now() - startMs,
        tlsFallback: true,
        responsePreview: err.message
      });
      reject(err);
    });
    req.end();
  });
}

async function tracedFetch(url, options = {}) {
  const startMs = Date.now();
  const method = options.method || 'GET';
  try {
    const res = await fetch(url, options);
    const store = debugStorage.getStore();
    if (Array.isArray(store)) {
      let bodyText = '';
      try {
        bodyText = await res.clone().text();
      } catch {}
      pushDebugLog({
        method,
        url,
        requestHeaders: options.headers || {},
        status: res.status,
        durationMs: Date.now() - startMs,
        tlsFallback: false,
        responsePreview: formatDebugBody(bodyText)
      });
    }
    return res;
  } catch (e) {
    pushDebugLog({
      method,
      url,
      requestHeaders: options.headers || {},
      status: 'ERR',
      durationMs: Date.now() - startMs,
      tlsFallback: false,
      responsePreview: `${e.message}${e.cause?.message ? ` (${e.cause.message})` : ''}`
    });
    throw e;
  }
}

async function fetchJson(url, headers = {}) {
  const reqHeaders = { 'User-Agent': DEFAULT_UA, Accept: 'application/json', ...headers };
  let res;
  try {
    res = await tracedFetch(url, {
      headers: reqHeaders,
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    // Fallback si le serveur du tracker a une chaîne de certificats TLS incomplète
    res = await fetchWithTlsFallback(url, { headers: reqHeaders, timeoutMs: 15000 });
  }
  if (res.status === 401) throw new Error('401 : clé API absente ou invalide');
  if (res.status === 403) throw new Error('403 : accès refusé (clé sans permission ou protection Cloudflare/Anubis)');
  if (res.status === 429) throw new Error('429 : limite atteinte, réessayez dans une minute');
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url.replace(/[?&](api_?token|apikey)=[^&]*/i, '')}`);
  try {
    return await res.json();
  } catch {
    throw new Error('Réponse non JSON (URL incorrecte ou clé invalide)');
  }
}

/** Parse une exposition Prometheus (/metrics) pour extraire upload/download en octets */
async function fetchPrometheusMetrics(metricsUrl, prefix) {
  const url = metricsUrl.includes('/metrics') ? metricsUrl : `${metricsUrl.replace(/\/+$/, '')}/metrics`;
  const res = await tracedFetch(url, {
    headers: { 'User-Agent': DEFAULT_UA },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const text = await res.text();
  const upRe = new RegExp(`^${prefix}_total_uploaded_bytes\\s+([0-9.eE+-]+)`, 'm');
  const dlRe = new RegExp(`^${prefix}_total_downloaded_bytes\\s+([0-9.eE+-]+)`, 'm');
  const upM = text.match(upRe);
  const dlM = text.match(dlRe);
  if (!upM && !dlM) {
    throw new Error(`Métriques ${prefix}_total_*_bytes absentes sur ${url}`);
  }
  return buildStats({
    uploaded: upM ? parseFloat(upM[1]) : 0,
    downloaded: dlM ? parseFloat(dlM[1]) : 0,
    ratio: null,
    points: null,
    seeding: null,
    freeleech: null
  });
}

/** Connecteur UNIT3D générique : GET /api/user (ex. G3MINI, The Old School, Generation Free) */
export async function fetchUnit3dStats(baseUrl, apiKey) {
  const origin = baseUrl.replace(/\/+$/, '').replace(/\/api(\/user)?$/, '');
  const d = await fetchJson(`${origin}/api/user?api_token=${encodeURIComponent(apiKey)}`, {
    Authorization: `Bearer ${apiKey}`
  });
  const u = d?.data?.attributes ?? d?.data ?? d;
  const uploaded = parseSize(u.uploaded ?? u.upload);
  const downloaded = parseSize(u.downloaded ?? u.download);
  const ratio = toNumber(u.ratio);
  if (uploaded === null && downloaded === null && ratio === null) {
    throw new Error(`Réponse inattendue (champs: ${Object.keys(u || {}).slice(0, 12).join(', ')})`);
  }
  let freeleech = null;
  for (const v of [
    u.freeleech,
    u.is_freeleech,
    u.freeleech_global,
    u.freeleech_perso,
    u.freeleech_special,
    u.group?.is_freeleech,
    u.group?.freeleech,
    isFutureDate(u.freeleech_global_until),
    isFutureDate(u.freeleech_perso_until)
  ]) {
    if (v === true || v === 1) { freeleech = true; break; }
    if (v === false || v === 0) { if (freeleech === null) freeleech = false; }
  }
  const flTokens = toNumber(u.fl_tokens ?? u.freeleech_tokens ?? u.tokens);
  const extraBadges = [];
  if (u.group && typeof u.group === 'string') extraBadges.push(`👤 ${u.group}`);
  if (flTokens !== null && flTokens > 0) extraBadges.push(`🎟️ ${flTokens} FL`);
  return buildStats({
    uploaded,
    downloaded,
    ratio,
    points: toNumber(u.seedbonus ?? u.bonus ?? u.bon),
    pointsLabel: 'SEEDBONUS',
    flTokens,
    seeding: toNumber(u.seeding),
    leeching: toNumber(u.leeching),
    extraBadges,
    freeleech
  });
}

/** C411 : GET /api/user/profile (Authorization: Bearer, scope profile:read) */
export async function fetchC411Stats(baseUrl, apiKey) {
  const origin = (baseUrl || 'https://c411.org').replace(/\/+$/, '').replace(/\/api(\/user(\/profile)?)?$/, '');
  const raw = String(apiKey || '').trim();
  // Permet de passer soit uniquement la clé Bearer, soit "CLE_API; cookie_session"
  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean);
  const bearerKey = parts[0] && !parts[0].includes('=') ? parts[0] : raw;
  const cookiePart = parts.filter((p) => p.includes('=')).join('; ');

  const headers = { Authorization: `Bearer ${bearerKey}` };
  if (cookiePart) headers.Cookie = cookiePart;

  const d = await fetchJson(`${origin}/api/user/profile`, headers);
  const uploaded = parseSize(d?.transfer?.uploaded?.total);
  const downloaded = parseSize(d?.transfer?.downloaded?.total);
  if (uploaded === null && downloaded === null) {
    throw new Error(`Réponse inattendue (champs: ${Object.keys(d || {}).slice(0, 12).join(', ')})`);
  }
  let seeding = toNumber(
    d?.seeding ??
    d?.seeds ??
    d?.activeSeeds ??
    d?.seeding_count ??
    d?.transfer?.seeding ??
    d?.stats?.seeding
  );
  // Si un cookie de session C411 est fourni en complément, récupère le nombre exact de seeds actifs
  if (seeding === null && cookiePart) {
    try {
      const dash = await fetchJson(`${origin}/api/profile/dashboard`, { Cookie: cookiePart });
      seeding = toNumber(dash?.activeSeeds ?? dash?.seeding ?? dash?.stats?.activeSeeds ?? dash?.tracker?.seeding);
    } catch {}
  }
  const lvl = d?.level?.level ?? null;
  const extraBadges = [];
  if (lvl !== null) extraBadges.push(`⭐ Niv. ${lvl}`);
  return buildStats({
    uploaded,
    downloaded,
    ratio: null,
    points: toNumber(d?.zen?.balance),
    pointsLabel: 'ZEN',
    level: lvl,
    extraBadges,
    seeding,
    freeleech: typeof d?.freeleech?.active === 'boolean' ? d.freeleech.active : null
  });
}

/** TR4KER : GET https://tr4ker.net/api/me + /api/me/stats (X-Api-Key) */
export async function fetchTr4kerStats(baseUrl, apiKey) {
  const origin = (!baseUrl || baseUrl.includes('jackett'))
    ? 'https://tr4ker.net'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
  const [meRes, statsRes] = await Promise.allSettled([
    fetchJson(`${origin}/api/me`, { 'X-Api-Key': apiKey }),
    fetchJson(`${origin}/api/me/stats`, { 'X-Api-Key': apiKey })
  ]);
  if (meRes.status !== 'fulfilled') {
    throw meRes.reason;
  }
  const d = meRes.value;
  const st = statsRes.status === 'fulfilled' ? statsRes.value : null;
  const up = toNumber(d?.uploaded);
  const down = toNumber(d?.downloaded);
  if (up === null && down === null) {
    throw new Error(`Réponse inattendue (champs: ${Object.keys(d || {}).slice(0, 12).join(', ')})`);
  }
  const fl = d.freeleech_global === true || isFutureDate(d.personal_freeleech_until)
    ? true
    : typeof d.freeleech_global === 'boolean' ? false : null;
  const seeding = toNumber(
    st?.statistics?.torrents_seeding ??
    d?.torrents_seeding ??
    d?.seeding ??
    d?.seeding_count
  );
  return buildStats({
    uploaded: (up ?? 0) + (toNumber(d.bonus_upload) ?? 0),
    downloaded: (down ?? 0) + (toNumber(d.bonus_download) ?? 0),
    ratio: null,
    points: toNumber(d.money),
    pointsLabel: d.token_currency_name ? String(d.token_currency_name).toUpperCase() : 'CRÉDITS',
    seeding,
    freeleech: fl
  });
}

/** Draupnirr : GET https://draupnirr.xyz/api/me (X-Api-Key: drp_...) */
export async function fetchDraupnirrStats(baseUrl, apiKey) {
  const origin = (!baseUrl || baseUrl.includes('jackett'))
    ? 'https://draupnirr.xyz'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
  const d = await fetchJson(`${origin}/api/me`, { 'X-Api-Key': apiKey });
  const up = toNumber(d?.uploaded);
  const down = toNumber(d?.downloaded);
  if (up === null && down === null) {
    throw new Error(`Réponse inattendue (champs: ${Object.keys(d || {}).slice(0, 12).join(', ')})`);
  }
  const fl = d.freeleech_global === true || isFutureDate(d.freeleech_until)
    ? true
    : typeof d.freeleech_global === 'boolean' ? false : null;
  const extraBadges = [];
  if (d.invites) extraBadges.push(`✉️ ${d.invites} invit.`);
  let seeding = toNumber(d.seeding ?? d.seeding_count ?? d.torrents_seeding ?? d.active_seeds);
  if (seeding === null && toNumber(d.seedtime_seconds) > 0 && toNumber(d.seedtime_cumulative_seconds) >= 0) {
    seeding = Math.round(toNumber(d.seedtime_cumulative_seconds) / toNumber(d.seedtime_seconds));
  }
  return buildStats({
    uploaded: (up ?? 0) + (toNumber(d.bonus_upload) ?? 0),
    downloaded: down ?? 0,
    buffer: toNumber(d.buffer),
    ratio: toNumber(d.ratio),
    points: toNumber(d.credits),
    pointsLabel: 'CRÉDITS',
    extraBadges,
    seeding,
    freeleech: fl
  });
}

/** AstraTorrent : GET https://astratorrent.la/api/user.php?apikey=... */
export async function fetchAstraStats(baseUrl, apiKey) {
  const origin = (!baseUrl || baseUrl.includes('jackett'))
    ? 'https://astratorrent.la'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
  const d = await fetchJson(`${origin}/api/user.php?apikey=${encodeURIComponent(apiKey)}`);
  if (d?.status && d.status !== 'success') {
    throw new Error(d.message || d.error || `Erreur Astra: ${d.status}`);
  }
  const uploaded = toNumber(d?.uploaded);
  const downloaded = toNumber(d?.downloaded);
  if (uploaded === null && downloaded === null) {
    throw new Error(`Réponse Astra inattendue (champs: ${Object.keys(d || {}).slice(0, 12).join(', ')})`);
  }
  const extraBadges = [];
  if (d.active_contracts != null) extraBadges.push(`📜 ${d.active_contracts} contrat(s)`);
  return buildStats({
    uploaded,
    downloaded,
    ratio: toNumber(d.ratio),
    points: toNumber(d.bonus_points ?? d.karma),
    pointsLabel: 'KARMA / ASTRA',
    seeding: toNumber(d.seeding),
    leeching: toNumber(d.leeching),
    extraBadges,
    freeleech: typeof d.freeleech === 'boolean' ? d.freeleech : null
  });
}

/**
 * TeamFlix : tracker UNIT3D (https://tracker.teamflix.cc/api/user)
 * Si l'indexeur est ajouté via Jackett Torznab dans Prowlarr, bascule automatiquement sur https://tracker.teamflix.cc.
 */
export async function fetchTeamFlixStats(baseUrl, apiKey) {
  const origin = (!baseUrl || baseUrl.includes('jackett'))
    ? 'https://tracker.teamflix.cc'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
  return fetchUnit3dStats(origin, apiKey);
}

/**
 * SpeedApp : GET https://speedapp.io/api/me (Authorization: Bearer <token>)
 * Accepte soit un jeton API (généré sur https://speedapp.io/profile/api-tokens),
 * soit des identifiants "email:motdepasse" (auquel cas on appelle POST /api/login pour obtenir le Bearer token).
 */
const speedAppTokens = new Map(); // credKey -> { token, exp }

export async function fetchSpeedAppStats(baseUrl, apiKey) {
  const origin = (!baseUrl || baseUrl.includes('jackett'))
    ? 'https://speedapp.io'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
  const raw = String(apiKey || '').trim();
  if (!raw) {
    throw new Error('Jeton API SpeedApp (speedapp.io/profile/api-tokens) ou email:motdepasse requis');
  }

  let token = raw;
  // Si l'utilisateur a saisi email:motdepasse (et que ce n'est pas un cookie)
  if (raw.includes(':') && !raw.includes(';') && !raw.startsWith('eyJ')) {
    const cached = speedAppTokens.get(raw);
    if (cached && cached.exp > Date.now()) {
      token = cached.token;
    } else {
      const idx = raw.indexOf(':');
      const username = raw.slice(0, idx).trim();
      const password = raw.slice(idx + 1).trim();
      const loginRes = await tracedFetch(`${origin}/api/login`, {
        method: 'POST',
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(15000)
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok || !loginData?.token) {
        throw new Error(loginData?.message || `Échec login SpeedApp (HTTP ${loginRes.status})`);
      }
      token = loginData.token;
      speedAppTokens.set(raw, { token, exp: Date.now() + 30 * 60 * 1000 });
    }
  }

  const d = await fetchJson(`${origin}/api/me`, {
    Authorization: `Bearer ${token}`
  });
  const u = d?.data?.attributes ?? d?.data ?? d?.user ?? d?.profile ?? d;
  const uploaded = parseSize(u?.uploaded ?? u?.upload ?? u?.uploaded_bytes ?? u?.raw_uploaded);
  const downloaded = parseSize(u?.downloaded ?? u?.download ?? u?.downloaded_bytes ?? u?.raw_downloaded);
  const ratio = toNumber(u?.ratio);
  if (uploaded === null && downloaded === null && ratio === null) {
    throw new Error(`Réponse SpeedApp /api/me inattendue (champs: ${Object.keys(u || {}).slice(0, 12).join(', ')})`);
  }
  let freeleech = null;
  for (const v of [u?.freeleech, u?.is_freeleech, u?.personal_freeleech, isFutureDate(u?.freeleech_until)]) {
    if (typeof v === 'boolean' && v) {
      freeleech = true;
      break;
    }
  }
  const flTokens = toNumber(u?.free_leech_tokens ?? u?.fl_tokens ?? u?.freeleech_tokens);
  const extraBadges = [];
  if (flTokens !== null && flTokens > 0) extraBadges.push(`🎟️ ${flTokens} FL`);
  if (toNumber(u?.double_upload_tokens) > 0) extraBadges.push(`⚡ ${toNumber(u.double_upload_tokens)} 2xUP`);
  if (u?.invites > 0) extraBadges.push(`✉️ ${u.invites} invit.`);
  return buildStats({
    uploaded,
    downloaded,
    ratio,
    points: toNumber(u?.credits ?? u?.bonus_points ?? u?.seedbonus ?? u?.bonus ?? u?.points ?? u?.bp),
    pointsLabel: u?.credits !== undefined ? 'CRÉDITS' : 'POINTS',
    flTokens,
    seeding: toNumber(u?.seeding ?? u?.seeding_count ?? u?.seed_count ?? u?.active_seeds),
    leeching: toNumber(u?.leeching ?? u?.leeching_count),
    extraBadges,
    freeleech
  });
}

/**
 * Crazy Spirits : portage direct de scrappers/crazyspirits.py (kreezx/api-ratio).
 * Attend le cookie "uid=...; pass=..." dans apiKey, ou bascule sur api-ratio si configuré.
 */
export async function fetchCrazySpiritsStats(indexer, cfg, apiKey, apiRatioUrl) {
  const cookieStr = (apiKey || '').trim().replace(/^["']|["']$/g, '');
  if (!cookieStr.includes('uid=') || !cookieStr.includes('pass=')) {
    if (apiRatioUrl) return fetchApiRatioStats(indexer, { ...cfg, apiRatioKey: 'crazyspirits' }, apiRatioUrl);
    throw new Error("Cookie 'uid=...; pass=...' requis dans le champ Clé/Cookie (ou configurez l'URL api-ratio)");
  }
  const base = (!cfg.baseUrl || cfg.baseUrl.includes('feed.php') || cfg.baseUrl.includes('jackett'))
    ? 'https://crazyspirits.com'
    : cfg.baseUrl.replace(/\/+$/, '');
  const uidM = cookieStr.match(/(?:^|;\s*)uid=([^;\s]+)/);
  const uid = uidM ? uidM[1] : '';

  const headers = {
    'User-Agent': DEFAULT_UA,
    Accept: 'text/html,application/xhtml+xml',
    Referer: `${base}/`,
    Cookie: cookieStr
  };
  const [homeRes, accRes] = await Promise.all([
    fetchWithTlsFallback(`${base}/index.php`, { headers, timeoutMs: 15000 }),
    uid
      ? fetchWithTlsFallback(`${base}/account-details.php?id=${encodeURIComponent(uid)}`, { headers, timeoutMs: 15000 }).catch(() => null)
      : Promise.resolve(null)
  ]);
  const homeHtml = await homeRes.text();
  const accHtml = accRes ? await accRes.text() : '';
  if (
    homeRes.url.toLowerCase().includes('account-login') ||
    (homeHtml.toLowerCase().includes('connexion') && homeHtml.includes('name="username"'))
  ) {
    throw new Error('Session Crazy Spirits expirée ou cookie uid/pass invalide');
  }

  const parseHtml = (html) => {
    const infobar = html.match(/<div[^>]*id=["']infobar["'][^>]*>([\s\S]*?)<\/div>/i);
    if (infobar) {
      const fonts = [...infobar[1].matchAll(/<font[^>]*>([\s\S]*?)<\/font>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim()
      );
      if (fonts.length >= 2) {
        const dl = parseSize(fonts[0]);
        const up = parseSize(fonts[1]);
        if (up !== null || dl !== null) return { up: up ?? 0, dl: dl ?? 0 };
      }
    }
    const upM = html.match(/Partager\s*:[\s\S]*?<span[^>]*class=["']detail_fix["'][^>]*>([\s\S]*?)<\/span>/i);
    const dlM = html.match(/T[ée]l[ée]charger\s*:[\s\S]*?<span[^>]*class=["']detail_fix["'][^>]*>([\s\S]*?)<\/span>/i);
    return {
      up: upM ? parseSize(upM[1].replace(/<[^>]+>/g, '').trim()) : null,
      dl: dlM ? parseSize(dlM[1].replace(/<[^>]+>/g, '').trim()) : null
    };
  };

  let { up, dl } = parseHtml(homeHtml);
  if ((up === null || up === 0) && (dl === null || dl === 0) && accHtml) {
    const acc = parseHtml(accHtml);
    up = acc.up;
    dl = acc.dl;
  }
  if (up === null && dl === null) {
    throw new Error('Impossible de lire les stats Crazy Spirits sur la page');
  }
  const cleanText = `${homeHtml} ${accHtml}`
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ');
  const bonusM =
    cleanText.match(/Crazy\s+Bonus\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i) ||
    cleanText.match(/(?:bonus|points?|cr[ée]dit)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)/i);

  // Extraction du nombre de torrents en partage sur account-details.php
  let seeding = null;
  let leeching = null;
  if (accHtml) {
    const seedSection = accHtml.match(/Actuellement\s+en\s+partage[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (seedSection) {
      seeding = [...seedSection[1].matchAll(/torrents-details\.php\?id=\d+/gi)].length;
    } else if (/Actuellement\s+en\s+partage/i.test(accHtml)) {
      seeding = 0;
    }
    const leechSection = accHtml.match(/Actuellement\s+en\s+t[ée]l[ée]chargement[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (leechSection) {
      leeching = [...leechSection[1].matchAll(/torrents-details\.php\?id=\d+/gi)].length;
    }
  }
  const extraBadges = [];
  const invM = cleanText.match(/Tu\s+as\s+(\d+)\s+invitations?/i);
  if (invM && Number(invM[1]) > 0) extraBadges.push(`✉️ ${invM[1]} invit.`);

  return buildStats({
    uploaded: up ?? 0,
    downloaded: dl ?? 0,
    ratio: null,
    points: bonusM ? toNumber(bonusM[1]) : null,
    pointsLabel: 'CRAZY BONUS',
    seeding,
    leeching,
    extraBadges,
    freeleech: null
  });
}

/**
 * Nostradamus : portage de scrappers/nostradamus.py (kreezx/api-ratio).
 * - Si api-ratio est configuré et qu'aucun cookie '_nostradamus_key' n'est fourni, utilise api-ratio.
 * - Sinon, résout le challenge Anubis PoW SHA-256 en Node.js et parse https://nostradamus.foo/settings
 *   avec le cookie de session fourni.
 */
let nostradamusAnubisCookies = [];

async function passAnubisChallenge(origin, initialCookies = []) {
  const res1 = await tracedFetch(`${origin}/sign-in`, {
    headers: { 'User-Agent': DEFAULT_UA, Cookie: initialCookies.join('; ') },
    signal: AbortSignal.timeout(15000)
  });
  const set1 = (res1.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('='));
  const html = await res1.text();
  const idx = html.indexOf('id="anubis_challenge"');
  if (idx < 0) return [...initialCookies, ...set1];
  const s = html.indexOf('>', idx) + 1;
  const e = html.indexOf('</script>', s);
  const { challenge, rules } = JSON.parse(html.slice(s, e));
  const prefix = '0'.repeat(rules.difficulty || 2);
  let nonce = 0;
  let hash = '';
  while (nonce < 5_000_000) {
    hash = crypto.createHash('sha256').update(challenge.randomData + nonce).digest('hex');
    if (hash.startsWith(prefix)) break;
    nonce++;
  }
  const cookies1 = [...initialCookies, ...set1];
  const passUrl = `${origin}/.within.website/x/cmd/anubis/api/pass-challenge?id=${encodeURIComponent(challenge.id)}&response=${hash}&nonce=${nonce}&redir=%2Fsettings&elapsedTime=15`;
  const res2 = await tracedFetch(passUrl, {
    headers: { 'User-Agent': DEFAULT_UA, Cookie: cookies1.join('; ') },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  const set2 = (res2.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('=') && !c.includes('cookie-verification'));
  return set2.length ? set2 : [...cookies1, ...set2];
}

function parseNostradamusText(rawHtml) {
  const cleanHtml = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const unitRe = '(?:[KMGTP]i?[Bo]|B|o)\\b';
  const numUnitRe = `([0-9]+(?:[.,][0-9]+)?\\s*${unitRe})`;

  const upAfter = text.match(new RegExp(`(?:Uploaded|Upload[ée]?|Octets upload[ée]s|Upload total)\\s*[:\\-–]?\\s*${numUnitRe}`, 'i'));
  const upBefore = text.match(new RegExp(`${numUnitRe}\\s*(?:Uploaded|Upload[ée]?)\\b`, 'i'));
  const upArrow = text.match(new RegExp(`(?:↑|▲)\\s*${numUnitRe}`, 'i'));

  const dlAfter = text.match(new RegExp(`(?:Downloaded|T[ée]l[ée]charg[ée]s?|Download|Total t[ée]l[ée]charg[ée]|Octets t[ée]l[ée]charg[ée]s)\\s*[:\\-–]?\\s*${numUnitRe}`, 'i'));
  const dlBefore = text.match(new RegExp(`${numUnitRe}\\s*(?:Downloaded|T[ée]l[ée]charg[ée]s?|Download)\\b`, 'i'));
  const dlArrow = text.match(new RegExp(`(?:↓|▼)\\s*${numUnitRe}`, 'i'));

  const ratioM =
    text.match(/Ratio\s*[:\-–]?\s*([0-9]+(?:[.,][0-9]+)?|∞|Inf)/i) ||
    text.match(/([0-9]+(?:[.,][0-9]+)?)\s*Ratio\b/i);
  const bonusM =
    text.match(/(?:Bonus(?:\s*Points)?|Available BP|BP disponibles|Points)\s*[:\-–]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:pts|BP)?/i) ||
    text.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:BP|pts)\b/i);
  const seedM =
    text.match(/(?:Seeding|En\s+partage|Seeds?|Torrents?\s+en\s+seed)\s*[:\-–]?\s*(\d+)/i) ||
    text.match(/(\d+)\s+(?:en\s+partage|seeding)/i);

  const upStr = (upAfter || upBefore || upArrow)?.[1];
  const dlStr = (dlAfter || dlBefore || dlArrow)?.[1];
  let uploaded = upStr ? parseSize(upStr) : null;
  let downloaded = dlStr ? parseSize(dlStr) : null;
  const ratio = ratioM ? (/∞|inf/i.test(ratioM[1]) ? null : toNumber(ratioM[1])) : null;
  const points = bonusM ? toNumber(bonusM[1]) : null;
  let seeding = seedM ? toNumber(seedM[1]) : null;
  const fl = /All downloads currently count as 0 GB|Tous les téléchargements comptent actuellement pour 0 Go|Freeleech\s*:\s*(?:active|actif|oui|on)/i.test(text)
    ? true
    : null;

  // Sur Nostradamus, la carte Statistiques n'affiche que "Bonus: XXX" (ou "Statistiques du tracker indisponibles.")
  // lorsque le compte n'a pas de compteur d'upload/download actif (tracker à points / 0 trafic).
  const isAuthenticatedSettings =
    points !== null ||
    /Statistiques du tracker indisponibles|Tracker stats unavailable|Passkey tracker/i.test(text);
  if (uploaded === null && downloaded === null && isAuthenticatedSettings) {
    uploaded = 0;
    downloaded = 0;
    if (seeding === null) seeding = 0;
  }

  return { uploaded, downloaded, ratio, points, seeding, freeleech: fl, text };
}

export async function fetchNostradamusStats(indexer, cfg, apiKey, apiRatioUrl) {
  let raw = (apiKey || '').trim();
  // Normalise si l'utilisateur a collé directement SFMyNTY... ou _nostradamus_key-SFMyNTY...
  if (raw.startsWith('SFMyNTY.')) {
    raw = `_nostradamus_key=${raw}`;
  } else {
    raw = raw.replace(/(^|;\s*)_?nostradamus_key[-=]/g, '$1_nostradamus_key=');
  }
  // Retire d'éventuels cookies techaro.lol-anubis copiés du navigateur (liés à l'UA du navigateur)
  raw = raw
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith('techaro.lol-anubis'))
    .join('; ');

  const looksLikeCookie = raw.includes('_nostradamus_key=') || (raw.includes('=') && raw.includes(';'));
  if (!looksLikeCookie && apiRatioUrl) {
    return fetchApiRatioStats(indexer, { ...cfg, apiRatioKey: 'nostradamus' }, apiRatioUrl);
  }
  if (!looksLikeCookie) {
    throw new Error(
      "Nostradamus utilise Phoenix LiveView + Anubis : renseignez l'URL du service api-ratio ou collez votre cookie '_nostradamus_key=SFMyNTY...' dans le champ Clé/Cookie"
    );
  }
  const origin = 'https://nostradamus.foo';
  if (!nostradamusAnubisCookies.length) {
    nostradamusAnubisCookies = await passAnubisChallenge(origin);
  }

  const fetchPage = async (path) => {
    const reqHeaders = {
      'User-Agent': DEFAULT_UA,
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      Cookie: [...nostradamusAnubisCookies, raw].join('; ')
    };
    let res = await tracedFetch(`${origin}${path}`, {
      headers: reqHeaders,
      signal: AbortSignal.timeout(15000)
    });
    let html = await res.text();
    if (html.includes('anubis_challenge')) {
      nostradamusAnubisCookies = await passAnubisChallenge(origin);
      res = await tracedFetch(`${origin}${path}`, {
        headers: {
          ...reqHeaders,
          Cookie: [...nostradamusAnubisCookies, raw].join('; ')
        },
        signal: AbortSignal.timeout(15000)
      });
      html = await res.text();
    }
    return { res, html };
  };

  let { res, html } = await fetchPage('/settings');
  if (html.includes('anubis_challenge')) {
    throw new Error('Challenge anti-bot Anubis non validé sur Nostradamus (réessayez)');
  }
  if (res.url.includes('/sign-in') || html.includes('id="private-key-input"')) {
    throw new Error(
      'Session Nostradamus non connectée : assurez-vous de copier le cookie _nostradamus_key APRÈS vous être connecté sur nostradamus.foo (le cookie est lié à votre IP)'
    );
  }

  // Sur Nostradamus, la carte "Statistiques" de /settings est chargée de façon asynchrone via Phoenix LiveView WebSocket
  let wsExtraText = '';
  if (typeof WebSocket !== 'undefined') {
    try {
      const extractAttr = (str, key) => {
        const i = str.indexOf(`${key}=`);
        if (i < 0) return '';
        const q = str[i + key.length + 1];
        const start = i + key.length + 2;
        return str.slice(start, str.indexOf(q, start));
      };
      const csrfIdx = html.indexOf('csrf-token');
      const csrf = csrfIdx >= 0 ? extractAttr(html.slice(csrfIdx), 'content') : '';
      const phxMainIdx = html.indexOf('data-phx-main');
      if (csrf && phxMainIdx >= 0) {
        const divChunk = html.slice(Math.max(0, phxMainIdx - 80), phxMainIdx + 1600);
        const phxId = extractAttr(divChunk, 'id');
        const phxSession = extractAttr(divChunk, 'data-phx-session');
        const phxStatic = extractAttr(divChunk, 'data-phx-static');
        const allCk = [...nostradamusAnubisCookies, raw].join('; ');
        wsExtraText = await new Promise((resolve) => {
          const strings = [];
          const collectStrings = (obj) => {
            if (!obj) return;
            if (typeof obj === 'string') {
              if (!obj.startsWith(' ') && !obj.includes('class=') && obj.length < 60) strings.push(obj);
            } else if (typeof obj === 'object') {
              for (const [k, v] of Object.entries(obj)) {
                if (k !== 's' && k !== 'p' && k !== 'r') collectStrings(v);
              }
            }
          };
          const ws = new WebSocket(
            `wss://nostradamus.foo/live/websocket?_csrf_token=${encodeURIComponent(csrf)}&vsn=2.0.0`,
            { headers: { 'User-Agent': DEFAULT_UA, Cookie: allCk, Origin: origin } }
          );
          const timer = setTimeout(() => {
            try { ws.close(); } catch {}
            resolve(strings.join(' : '));
          }, 2500);
          ws.onopen = () => {
            ws.send(
              JSON.stringify([
                '4',
                '4',
                `lv:${phxId}`,
                'phx_join',
                {
                  url: `${origin}/settings`,
                  params: { _csrf_token: csrf, _mounts: 0 },
                  session: phxSession,
                  static: phxStatic
                }
              ])
            );
          };
          ws.onmessage = (ev) => {
            try {
              const m = JSON.parse(String(ev.data));
              const c3 = m?.[4]?.['19']?.['0']?.['3']?.['1'];
              if (m?.[3] === 'diff' && c3) {
                collectStrings(c3);
                clearTimeout(timer);
                try { ws.close(); } catch {}
                resolve(strings.join(' : '));
              }
            } catch {}
          };
          ws.onerror = () => {
            clearTimeout(timer);
            resolve('');
          };
        });
      }
    } catch {}
  }

  let parsed = parseNostradamusText(`${wsExtraText} ${html}`);
  if (parsed.uploaded === null && parsed.downloaded === null && parsed.ratio === null) {
    // Essaie la page d'accueil (qui contient la barre utilisateur / lien /settings)
    const home = await fetchPage('/');
    if (!home.res.url.includes('/sign-in') && !home.html.includes('id="private-key-input"')) {
      parsed = parseNostradamusText(home.html + ' ' + html);
    }
  }

  if (parsed.uploaded === null && parsed.downloaded === null && parsed.ratio === null) {
    const preview = parsed.text.slice(0, 180);
    throw new Error(`Stats introuvables sur Nostradamus (page reçue : "${preview}...")`);
  }
  return buildStats({
    uploaded: parsed.uploaded,
    downloaded: parsed.downloaded,
    ratio: parsed.ratio,
    points: parsed.points,
    pointsLabel: 'BONUS',
    seeding: parsed.seeding ?? null,
    freeleech: parsed.freeleech
  });
}

/**
 * YggReborn : basé sur Rombond/yggreborn-exporter.
 * Supporte :
 *  1) URL d'exporter Prometheus (ex. http://localhost:9090/metrics) -> yggreborn_total_*_bytes
 *  2) Cookie de session (__ygg_sess=...; cf_clearance=...) sur https://www.yggreborn.org/account/
 *     + /account/torrents-actifs pour récupérer le nombre exact de seeds actifs
 */
export async function fetchYggRebornStats(baseUrl, apiKey) {
  if (baseUrl && (baseUrl.includes('/metrics') || /:\d{4,5}(\/|$)/.test(baseUrl))) {
    return fetchPrometheusMetrics(baseUrl, 'yggreborn');
  }
  let cookie = (apiKey || '').trim();
  // Normalise les formats copiés depuis des extensions (_ygg_sess-..., __ygg_sess-..., cf_clearance-...)
  if (cookie.startsWith('.eJ') || cookie.startsWith('eyJ')) {
    cookie = `__ygg_sess=${cookie}`;
  } else {
    cookie = cookie
      .replace(/(^|;\s*)_?_?ygg_sess[-=]/g, '$1__ygg_sess=')
      .replace(/(^|;\s*)cf_clearance[-=]/g, '$1cf_clearance=');
  }
  if (!cookie.includes('__ygg_sess=')) {
    throw new Error(
      "L'API Torznab de YggReborn ne renvoie pas le profil : indiquez l'URL de yggreborn-exporter (ex. http://localhost:9090/metrics) dans URL, ou collez votre cookie '__ygg_sess=...; cf_clearance=...' dans le champ Clé/Cookie"
    );
  }
  const origin = (!baseUrl || baseUrl.includes('api.yggreborn'))
    ? 'https://www.yggreborn.org'
    : baseUrl.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '').replace(/\/account\/?$/, '');
  const reqHeaders = { 'User-Agent': DEFAULT_UA, Cookie: cookie };
  const [res, activeRes] = await Promise.all([
    tracedFetch(`${origin}/account/`, {
      redirect: 'manual',
      headers: reqHeaders,
      signal: AbortSignal.timeout(15000)
    }),
    tracedFetch(`${origin}/account/torrents-actifs`, {
      redirect: 'manual',
      headers: reqHeaders,
      signal: AbortSignal.timeout(15000)
    }).catch(() => null)
  ]);
  const html = await res.text();
  if (
    res.status === 301 ||
    res.status === 302 ||
    res.status === 308 ||
    res.status === 403 ||
    html.includes('<title>YggReborn | Connexion</title>')
  ) {
    throw new Error('Session YggReborn expirée ou bloquée par Cloudflare (rafraîchissez __ygg_sess / cf_clearance ou utilisez yggreborn-exporter)');
  }
  const upM = html.match(/text-mint-400[^"]*">\s*([^<]+?)\s*<\/div>\s*<div[^>]*>\s*Upload\s*<\/div>/i);
  const dlM = html.match(/text-red-400[^"]*">\s*([^<]+?)\s*<\/div>\s*<div[^>]*>\s*Download\s*<\/div>/i);
  const ratioM =
    html.match(/([0-9]+(?:[.,][0-9]+)?)\s*<\/div>\s*<div[^>]*>\s*Ratio\s*<\/div>/i) ||
    html.match(/Ratio\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!upM && !dlM) {
    throw new Error('Blocs Upload/Download introuvables sur /account/ de YggReborn');
  }
  let seeding = null;
  let leeching = null;
  if (activeRes && activeRes.ok) {
    const activeHtml = await activeRes.text();
    const activeClean = activeHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const seedM = activeClean.match(/(\d+)\s+en\s+partage/i);
    const leechM = activeClean.match(/(\d+)\s+en\s+t[ée]l[ée]chargement/i);
    if (seedM) seeding = toNumber(seedM[1]);
    if (leechM) leeching = toNumber(leechM[1]);
  }
  const cleanAccount = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const scoreM = cleanAccount.match(/Score\s+(\d+)/i);
  return buildStats({
    uploaded: upM ? parseSize(upM[1].trim()) : 0,
    downloaded: dlM ? parseSize(dlM[1].trim()) : 0,
    ratio: ratioM ? toNumber(ratioM[1]) : null,
    points: scoreM ? toNumber(scoreM[1]) : null,
    pointsLabel: 'SCORE',
    seeding,
    leeching,
    freeleech: null
  });
}

/**
 * V3X : API officielle https://api.v3x.club/api/me
 * Documentation V3X :
 *   curl https://api.v3x.club/api/me -H "Authorization: Bearer TA_CLE_PROFIL" (ou ?apikey=TA_CLE_PROFIL)
 *   Champs retournés : uploaded, downloaded, buffer, downloadedReal, ratio,
 *   bonusPoints (jetons), pointsPerHour, seeding, leeching, seedTimeSeconds,
 *   freeleechTokens, freeleech, freeleechUntil, globalFreeleech, globalFreeleechUntil,
 *   level, xp, nextLevelXp, prestige, hitAndRun, ratioFloor { floor, warnAt, level }.
 *   Supporte aussi une clé Torznab Prowlarr directement ou un exporter Prometheus (/metrics).
 */
export async function fetchV3xStats(baseUrl, apiKey) {
  if (baseUrl && (baseUrl.includes('/metrics') || /:\d{4,5}(\/|$)/.test(baseUrl))) {
    return fetchPrometheusMetrics(baseUrl, 'v3x');
  }
  const origin = (!baseUrl || baseUrl.includes('v3x.club') || baseUrl.includes('jackett'))
    ? 'https://api.v3x.club'
    : baseUrl.replace(/\/+$/, '').replace(/\/(api\/me|torznab.*)$/, '');
  const cred = (apiKey || '').trim();
  if (!cred) {
    throw new Error('Clé API V3X (« Mon profil » ou Torznab) manquante');
  }

  const d = await fetchJson(`${origin}/api/me`, {
    Authorization: `Bearer ${cred}`
  });

  const uploaded = toNumber(d?.uploaded ?? d?.upload);
  const downloaded = toNumber(d?.downloaded ?? d?.download);
  if (uploaded === null && downloaded === null && d?.ratio === undefined) {
    throw new Error(`Réponse V3X /api/me inattendue (champs: ${Object.keys(d || {}).slice(0, 12).join(', ')})`);
  }

  const fl = Boolean(
    d?.freeleech === true ||
    d?.globalFreeleech === true ||
    isFutureDate(d?.freeleechUntil) ||
    isFutureDate(d?.globalFreeleechUntil)
  );
  const pointsPerHour = toNumber(d?.pointsPerHour);
  const flTokens = toNumber(d?.freeleechTokens);
  const lvl = d?.level ?? null;
  const extraBadges = [];
  if (lvl !== null) extraBadges.push(`⭐ Niv. ${lvl}`);
  if (flTokens !== null && flTokens > 0) extraBadges.push(`🎟️ ${flTokens} FL`);
  if (d?.invitesLeft) extraBadges.push(`✉️ ${d.invitesLeft} invit.`);

  return buildStats({
    uploaded,
    downloaded,
    buffer: toNumber(d?.buffer),
    ratio: toNumber(d?.ratio),
    points: toNumber(d?.bonusPoints ?? d?.bonus ?? d?.points ?? d?.seedbonus),
    pointsLabel: 'JETONS',
    pointsPerHour,
    flTokens,
    seeding: toNumber(d?.seeding),
    leeching: toNumber(d?.leeching),
    level: lvl,
    extraBadges,
    freeleech: fl
  });
}

/** JSON personnalisé : URL complète + chemins des champs à lire */
export async function fetchCustomStats(cfg, apiKey) {
  const endpoint = (cfg.baseUrl || '').trim();
  if (!endpoint) throw new Error('URL de l\u2019endpoint profil manquante');
  if (endpoint.includes('v3x.club')) {
    return fetchV3xStats(endpoint, apiKey);
  }
  let url = endpoint;
  const headers = {};
  const mode = cfg.authMode || 'bearer';
  if (mode === 'bearer') headers.Authorization = `Bearer ${apiKey}`;
  else if (mode === 'xapikey') headers['X-Api-Key'] = apiKey;
  else url += `${url.includes('?') ? '&' : '?'}${mode === 'apikey' ? 'apikey' : 'api_token'}=${encodeURIComponent(apiKey)}`;

  const d = await fetchJson(url, headers);
  const rawUp = getPath(d, cfg.pathUp) ?? d?.uploaded ?? d?.upload;
  const rawDown = getPath(d, cfg.pathDown) ?? d?.downloaded ?? d?.download;
  const rawRatioVal = getPath(d, cfg.pathRatio);
  const rawRatio = typeof rawRatioVal === 'object' && rawRatioVal !== null ? d?.ratio : (rawRatioVal ?? d?.ratio);

  const uploaded = parseSize(rawUp);
  const downloaded = parseSize(rawDown);
  const ratio = toNumber(rawRatio);
  if (uploaded === null && downloaded === null && ratio === null) {
    throw new Error(`Chemins introuvables dans la réponse (champs: ${Object.keys(d || {}).slice(0, 15).join(', ')})`);
  }
  const fl = getPath(d, cfg.pathFl) ?? d?.freeleech ?? d?.globalFreeleech;
  const rawPoints = getPath(d, cfg.pathPoints) ?? d?.bonusPoints ?? d?.seedbonus ?? d?.points ?? d?.bonus ?? d?.karma ?? d?.money ?? d?.credits;
  return buildStats({
    uploaded,
    downloaded,
    buffer: toNumber(d?.buffer),
    ratio,
    points: toNumber(rawPoints),
    pointsPerHour: toNumber(d?.pointsPerHour),
    flTokens: toNumber(d?.freeleechTokens),
    seeding: toNumber(d?.seeding),
    leeching: toNumber(d?.leeching),
    freeleech: typeof fl === 'boolean' ? fl : fl === 1 ? true : fl === 0 ? false : null
  });
}

/**
 * api-ratio (https://github.com/kreezx/api-ratio) : service externe qui expose
 * GET /ratios -> { <tracker>: { ratio, upload: "1.23 TB", download: "...", bonus } }
 */
let apiRatioCache = { url: '', at: 0, data: null };

async function getApiRatioData(apiRatioUrl) {
  const base = String(apiRatioUrl || '').trim().replace(/\/+$/, '').replace(/\/ratios$/, '');
  if (!base) throw new Error('URL du service api-ratio non configurée (ex. http://localhost:8679)');
  if (apiRatioCache.url === base && Date.now() - apiRatioCache.at < 30000 && apiRatioCache.data) {
    return apiRatioCache.data;
  }
  const data = await fetchJson(`${base}/ratios`, {});
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Réponse /ratios inattendue');
  }
  apiRatioCache = { url: base, at: Date.now(), data };
  return data;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const API_RATIO_ALIASES = {
  g3mini: 'gemini',
  crazyspirit: 'crazyspirits',
  generationfree: 'gf_free',
  lacale: 'la_cale'
};

function pickApiRatioKey(indexer, cfg, data) {
  const keys = Object.keys(data);
  if (cfg.apiRatioKey) {
    const k = keys.find((x) => norm(x) === norm(cfg.apiRatioKey));
    if (!k) throw new Error(`Clé api-ratio « ${cfg.apiRatioKey} » absente (disponibles : ${keys.join(', ') || 'aucune'})`);
    return k;
  }
  const name = norm(indexer?.name);
  for (const [alias, target] of Object.entries(API_RATIO_ALIASES)) {
    if (name.includes(alias) && keys.includes(target)) return target;
  }
  const k = keys.find((x) => name.includes(norm(x)) || norm(x).includes(name));
  if (!k) throw new Error(`Aucun tracker api-ratio correspondant à « ${indexer?.name} » (disponibles : ${keys.join(', ') || 'aucun'})`);
  return k;
}

export async function fetchApiRatioStats(indexer, cfg, apiRatioUrl) {
  const data = await getApiRatioData(apiRatioUrl);
  const key = pickApiRatioKey(indexer, cfg, data);
  const e = data[key] ?? {};
  const uploaded = parseSize(e.upload);
  const downloaded = parseSize(e.download);
  if (uploaded === null && downloaded === null) {
    throw new Error(`api-ratio n\u2019a pas encore de stats pour « ${key} »`);
  }
  return {
    ...buildStats({
      uploaded,
      downloaded,
      ratio: null,
      points: toNumber(e.bonus),
      seeding: null,
      freeleech: null
    }),
    source: `api-ratio:${key}`
  };
}

/** Saisie manuelle (Go) */
export function manualStats(cfg) {
  const up = toNumber(cfg.manualUpGB);
  const down = toNumber(cfg.manualDownGB);
  return buildStats({
    uploaded: up === null ? null : up * 1024 ** 3,
    downloaded: down === null ? null : down * 1024 ** 3,
    ratio: null,
    points: null,
    seeding: null,
    freeleech: null
  });
}

/** Déduit URL + clé depuis la définition Prowlarr si non saisies. */
export function resolveTrackerConn(indexer, cfg) {
  const fields = indexer?.fields ?? [];
  const field = (...names) => {
    const f = fields.find((x) => names.includes(String(x.name).toLowerCase()));
    const v = f?.value;
    return typeof v === 'string' && v && !/^\*+$/.test(v) ? v : '';
  };
  const baseUrl =
    (cfg?.baseUrl || '').trim() || field('baseurl') || indexer?.indexerUrls?.[0] || '';
  const apiKey =
    (cfg?.apiKey || '').trim() || field('apikey', 'api_key', 'api_token', 'passkey', 'cookie');
  return { baseUrl, apiKey };
}

/** Stats complètes d'un indexeur selon sa config (jamais d'exception). */
export async function getTrackerStats(indexer, cfg, ctx = {}) {
  const debugLogs = ctx.debug ? [] : null;
  const runCore = async () => {
    try {
      if (cfg.type === 'public') {
        if (debugLogs) {
          pushDebugLog({
            method: 'LOCAL',
            url: 'tracker://public',
            requestHeaders: {},
            status: 200,
            durationMs: 0,
            tlsFallback: false,
            responsePreview: 'Tracker public configuré sans requête réseau (pas de ratio).'
          });
        }
        return { public: true, freeleech: cfg.freeleech === 'on' ? true : null };
      }
      let s;
      const { baseUrl, apiKey } = resolveTrackerConn(indexer, cfg);
      switch (cfg.type) {
        case 'apiratio':
          s = await fetchApiRatioStats(indexer, cfg, ctx.apiRatioUrl);
          break;
        case 'manual':
          s = manualStats(cfg);
          break;
        case 'c411':
          if (!apiKey) throw new Error('Clé API C411 manquante');
          s = await fetchC411Stats(baseUrl, apiKey);
          break;
        case 'tr4ker':
          if (!apiKey) throw new Error('Clé API TR4KER manquante');
          s = await fetchTr4kerStats(baseUrl, apiKey);
          break;
        case 'draupnirr':
          if (!apiKey) throw new Error('Clé API Draupnirr manquante');
          s = await fetchDraupnirrStats(baseUrl, apiKey);
          break;
        case 'astra':
          if (!apiKey) throw new Error('Clé API AstraTorrent manquante');
          s = await fetchAstraStats(baseUrl, apiKey);
          break;
        case 'speedapp':
          if (!apiKey) throw new Error('Jeton API SpeedApp manquant (speedapp.io/profile/api-tokens)');
          s = await fetchSpeedAppStats(baseUrl, apiKey);
          break;
        case 'teamflix':
          if (!apiKey) throw new Error('Clé API TeamFlix manquante');
          s = await fetchTeamFlixStats(baseUrl, apiKey);
          break;
        case 'crazyspirits':
          s = await fetchCrazySpiritsStats(indexer, cfg, apiKey, ctx.apiRatioUrl);
          break;
        case 'nostradamus':
          s = await fetchNostradamusStats(indexer, cfg, apiKey, ctx.apiRatioUrl);
          break;
        case 'yggreborn':
          s = await fetchYggRebornStats(baseUrl, apiKey);
          break;
        case 'v3x':
          s = await fetchV3xStats(baseUrl, apiKey);
          break;
        case 'custom':
          if (!apiKey) throw new Error('Clé API manquante');
          s = await fetchCustomStats(cfg, apiKey);
          break;
        default:
          if (!baseUrl || !apiKey) throw new Error('URL ou clé API UNIT3D manquante');
          s = await fetchUnit3dStats(baseUrl, apiKey);
      }
      if (cfg.freeleech === 'on') s.freeleech = true;
      else if (cfg.freeleech === 'off') s.freeleech = false;
      return s;
    } catch (e) {
      return { error: e.message };
    }
  };

  if (debugLogs) {
    const res = await debugStorage.run(debugLogs, runCore);
    return { ...res, debugLogs };
  }
  return runCore();
}
