import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const DATA_DIR = join(process.cwd(), 'data');
const USERS_FILE = join(DATA_DIR, 'data_auth.json');
const LEGACY_USERS_FILE = join(DATA_DIR, 'users.json');
export const SESSION_COOKIE = 'sortarr_session';

/**
 * Configure le cookie de session HTTPOnly avec détection automatique de HTTPS.
 */
export function setSessionCookie(cookies, token, requestOrUrl = null) {
  let isSecure = false;
  try {
    if (requestOrUrl) {
      if (typeof requestOrUrl === 'string' && requestOrUrl.startsWith('https:')) {
        isSecure = true;
      } else if (requestOrUrl.url) {
        const urlStr = typeof requestOrUrl.url === 'string' ? requestOrUrl.url : requestOrUrl.url.href;
        if (urlStr?.startsWith('https:')) isSecure = true;
      }
      const proto = requestOrUrl.headers?.get?.('x-forwarded-proto') || requestOrUrl.headers?.['x-forwarded-proto'];
      if (proto === 'https') isSecure = true;
    }
  } catch {}

  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: 30 * 24 * 3600
  });
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const loginAttempts = new Map(); // ip -> { count, lockedUntil }
const usedCaptchaIds = new Set();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getStorePath() {
  if (existsSync(LEGACY_USERS_FILE)) return LEGACY_USERS_FILE;
  return LEGACY_USERS_FILE;
}

function loadStore() {
  ensureDataDir();
  const path = getStorePath();
  if (!existsSync(path)) {
    const initial = {
      secret: crypto.randomBytes(32).toString('hex'),
      recaptchaSiteKey: '',
      recaptchaSecretKey: '',
      captchaDisabled: false,
      users: []
    };
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    if (!data.secret) data.secret = crypto.randomBytes(32).toString('hex');
    if (typeof data.recaptchaSiteKey !== 'string') data.recaptchaSiteKey = '';
    if (typeof data.recaptchaSecretKey !== 'string') data.recaptchaSecretKey = '';
    if (typeof data.captchaDisabled !== 'boolean') data.captchaDisabled = false;
    if (!Array.isArray(data.users)) data.users = [];
    return data;
  } catch {
    return {
      secret: crypto.randomBytes(32).toString('hex'),
      recaptchaSiteKey: '',
      recaptchaSecretKey: '',
      captchaDisabled: false,
      users: []
    };
  }
}

function saveStore(store) {
  ensureDataDir();
  writeFileSync(getStorePath(), JSON.stringify(store, null, 2));
}

// ── Rate-limiting anti-bruteforce ───────────────────────────────
function pruneStaleLoginAttempts() {
  if (loginAttempts.size > 500) {
    const now = Date.now();
    for (const [k, v] of loginAttempts.entries()) {
      if (!v.lockedUntil || now >= v.lockedUntil + 10 * 60 * 1000) {
        loginAttempts.delete(k);
      }
    }
  }
}

export function checkRateLimit(ip) {
  const key = ip || 'unknown';
  const entry = loginAttempts.get(key);
  if (!entry) return;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const secs = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw new Error(`Trop de tentatives échouées. Réessayez dans ${secs}s.`);
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    loginAttempts.delete(key);
  }
}

export function recordFailedAttempt(ip) {
  pruneStaleLoginAttempts();
  const key = ip || 'unknown';
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  // Verrouillage progressif : 15 min après 10 échecs, 2 min après 5 échecs
  if (entry.count >= 10) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000;
  } else if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 2 * 60 * 1000;
  }
  loginAttempts.set(key, entry);
}

export function clearFailedAttempts(ip) {
  loginAttempts.delete(ip || 'unknown');
}

// ── Base32 & TOTP (RFC 6238 — Google Authenticator / Authy) ────
export function generateTotpSecret(byteLength = 20) {
  const buf = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32ToBuffer(base32) {
  const clean = String(base32 || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeHotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  let tmp = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotpCode(secret, inputCode, window = 1) {
  const cleanCode = String(inputCode || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode) || !secret) return false;
  const secretBuf = base32ToBuffer(secret);
  const currentStep = Math.floor(Date.now() / 30000);
  const cleanBuf = Buffer.from(cleanCode);
  for (let w = -window; w <= window; w++) {
    const expected = computeHotp(secretBuf, currentStep + w);
    const expBuf = Buffer.from(expected);
    if (expBuf.length === cleanBuf.length && crypto.timingSafeEqual(expBuf, cleanBuf)) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(username, secret) {
  const label = encodeURIComponent(`Sortarr:${username}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=Sortarr&algorithm=SHA1&digits=6&period=30`;
}

// ── Gestion utilisateurs & 2FA ──────────────────────────────────
export function hasUsers() {
  const store = loadStore();
  return store.users.length > 0;
}

export function getSecuritySettings(username) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  return {
    totpEnabled: !!user?.totpEnabled,
    backupCodesRemaining: Array.isArray(user?.backupCodes) ? user.backupCodes.length : 0,
    recaptchaSiteKey: store.recaptchaSiteKey || '',
    recaptchaSecretKeySet: !!(store.recaptchaSecretKey || '').trim(),
    captchaDisabled: !!store.captchaDisabled
  };
}

export function getPublicRecaptchaConfig() {
  const store = loadStore();
  if (store.captchaDisabled) {
    return {
      mode: 'disabled',
      siteKey: '',
      disabled: true
    };
  }
  const siteKey = (store.recaptchaSiteKey || '').trim();
  const secretKey = (store.recaptchaSecretKey || '').trim();
  return {
    mode: siteKey && secretKey ? 'google' : 'builtin',
    siteKey: siteKey && secretKey ? siteKey : '',
    disabled: false
  };
}

export function saveRecaptchaSettings(siteKey, secretKey, captchaDisabled) {
  const store = loadStore();
  store.recaptchaSiteKey = String(siteKey || '').trim();
  if (secretKey !== undefined && secretKey !== null && secretKey !== '••••••••') {
    store.recaptchaSecretKey = String(secretKey).trim();
  }
  if (typeof captchaDisabled === 'boolean') {
    store.captchaDisabled = captchaDisabled;
  }
  saveStore(store);
}

export function createUser(username, password) {
  const cleanUser = String(username || '').trim();
  const rawPass = String(password || '');
  if (cleanUser.length < 2) {
    throw new Error("L'identifiant doit contenir au moins 2 caractères");
  }
  if (rawPass.length < 4) {
    throw new Error('Le mot de passe doit contenir au moins 4 caractères');
  }
  const store = loadStore();
  if (store.users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
    throw new Error('Cet identifiant existe déjà');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(rawPass, salt, 64).toString('hex');
  store.users.push({
    username: cleanUser,
    salt,
    passwordHash,
    totpEnabled: false,
    totpSecret: '',
    pendingTotpSecret: '',
    backupCodes: [],
    tokenVersion: 1,
    createdAt: new Date().toISOString()
  });
  saveStore(store);
  return { username: cleanUser };
}

export function verifyUser(username, password) {
  const cleanUser = String(username || '').trim();
  const rawPass = String(password || '');
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === cleanUser.toLowerCase());
  if (!user) return null;
  const derived = crypto.scryptSync(rawPass, user.salt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  if (derived.length !== expected.length || !crypto.timingSafeEqual(derived, expected)) {
    return null;
  }
  return {
    username: user.username,
    totpEnabled: !!user.totpEnabled
  };
}

export function changePassword(username, currentPassword, newPassword) {
  const cleanUser = String(username || '').trim();
  const rawNew = String(newPassword || '');
  if (!verifyUser(cleanUser, currentPassword)) {
    throw new Error('Mot de passe actuel incorrect');
  }
  if (rawNew.length < 4) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 4 caractères');
  }
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === cleanUser.toLowerCase());
  if (!user) throw new Error('Utilisateur introuvable');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(rawNew, salt, 64).toString('hex');
  user.salt = salt;
  user.passwordHash = passwordHash;
  // Révoque immédiatement toutes les sessions actives sur d'autres appareils
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  saveStore(store);
  return { ok: true };
}

export function startTotpSetup(username) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user) throw new Error('Utilisateur introuvable');
  const secret = generateTotpSecret(20);
  user.pendingTotpSecret = secret;
  saveStore(store);
  return {
    secret,
    otpauthUri: buildOtpAuthUri(user.username, secret)
  };
}

export function confirmTotpSetup(username, code) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !user.pendingTotpSecret) {
    throw new Error("Aucune configuration 2FA en attente. Cliquez d'abord sur Générer une clé 2FA.");
  }
  if (!verifyTotpCode(user.pendingTotpSecret, code)) {
    throw new Error('Code à 6 chiffres invalide. Vérifiez l’heure de votre téléphone et réessayez.');
  }
  user.totpSecret = user.pendingTotpSecret;
  user.pendingTotpSecret = '';
  user.totpEnabled = true;
  // Génère 6 codes de secours
  const backupCodes = Array.from({ length: 6 }, () =>
    `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
  );
  user.backupCodes = backupCodes;
  saveStore(store);
  return { backupCodes };
}

export function disableTotp(username, codeOrPassword) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user) throw new Error('Utilisateur introuvable');
  const input = String(codeOrPassword || '').trim();
  const validTotp = user.totpSecret && verifyTotpCode(user.totpSecret, input);
  const validPass = !!verifyUser(username, input);
  if (!validTotp && !validPass) {
    throw new Error('Code 2FA ou mot de passe incorrect pour désactiver la 2FA');
  }
  user.totpEnabled = false;
  user.totpSecret = '';
  user.pendingTotpSecret = '';
  user.backupCodes = [];
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  saveStore(store);
}

export function verifyUserTotpOrBackup(username, inputCode) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !user.totpEnabled) return false;
  const clean = String(inputCode || '').trim().toUpperCase();
  if (verifyTotpCode(user.totpSecret, clean)) return true;
  if (Array.isArray(user.backupCodes)) {
    const idx = user.backupCodes.findIndex((c) => c.toUpperCase() === clean);
    if (idx >= 0) {
      user.backupCodes.splice(idx, 1);
      saveStore(store);
      return true;
    }
  }
  return false;
}

// ── Jetons signés (Session + Pending 2FA + Captcha intégré) ─────
function signPayload(obj) {
  const store = loadStore();
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto.createHmac('sha256', store.secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySignedPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const store = loadStore();
  const expectedSig = crypto.createHmac('sha256', store.secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data?.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function createSessionToken(username) {
  const store = loadStore();
  const user = store.users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  const v = user?.tokenVersion || 1;
  return signPayload({
    t: 'session',
    u: username,
    v,
    exp: Date.now() + 30 * 24 * 3600 * 1000
  });
}

export function verifySessionToken(token) {
  const data = verifySignedPayload(token);
  if (!data || (data.t && data.t !== 'session') || !data.u) return null;
  const store = loadStore();
  const exists = store.users.find((u) => u.username.toLowerCase() === String(data.u).toLowerCase());
  if (!exists) return null;
  // Vérifie la version de session pour invalider les anciens tokens après changement de mot de passe
  const currentVersion = exists.tokenVersion || 1;
  if (data.v !== undefined && data.v !== currentVersion) {
    return null;
  }
  return { username: exists.username, totpEnabled: !!exists.totpEnabled };
}

export function createPending2FAToken(username) {
  return signPayload({
    t: '2fa_pending',
    u: username,
    exp: Date.now() + 5 * 60 * 1000 // 5 min
  });
}

export function verifyPending2FAToken(token) {
  const data = verifySignedPayload(token);
  if (!data || data.t !== '2fa_pending' || !data.u) return null;
  return data.u;
}

// ── reCAPTCHA (Google reCAPTCHA v2 + Captcha visuel intégré) ────
export function generateBuiltinCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  const id = crypto.randomBytes(8).toString('hex');
  const token = signPayload({
    t: 'captcha',
    id,
    ans: code.toUpperCase(),
    exp: Date.now() + 5 * 60 * 1000
  });

  // Génère un SVG distordu avec lignes de bruit
  const lines = Array.from({ length: 5 }, () => {
    const x1 = crypto.randomInt(0, 160);
    const y1 = crypto.randomInt(0, 48);
    const x2 = crypto.randomInt(0, 160);
    const y2 = crypto.randomInt(0, 48);
    const col = ['#7c3aed', '#6366f1', '#a78bfa', '#475569'][crypto.randomInt(0, 4)];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.5" opacity="0.5"/>`;
  }).join('');

  const letters = code
    .split('')
    .map((ch, idx) => {
      const x = 22 + idx * 26 + crypto.randomInt(-3, 4);
      const y = 32 + crypto.randomInt(-4, 5);
      const rot = crypto.randomInt(-18, 19);
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" fill="#e2e8f0" font-family="monospace" font-size="22" font-weight="bold">${ch}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48" style="background:#0f172a;border-radius:6px">${lines}${letters}</svg>`;
  return { token, svg };
}

export async function verifyCaptchaResponse({ recaptchaToken, captchaToken, captchaAnswer, ip }) {
  const store = loadStore();
  if (store.captchaDisabled) {
    return true;
  }
  const siteKey = (store.recaptchaSiteKey || '').trim();
  const secretKey = (store.recaptchaSecretKey || '').trim();

  // Mode 1 : Google reCAPTCHA v2 officiel
  if (siteKey && secretKey) {
    if (!recaptchaToken) {
      throw new Error('Veuillez valider le reCAPTCHA Google ("Je ne suis pas un robot")');
    }
    const params = new URLSearchParams({
      secret: secretKey,
      response: recaptchaToken
    });
    if (ip) params.set('remoteip', ip);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error('Échec de la vérification Google reCAPTCHA. Veuillez réessayer.');
    }
    return true;
  }

  // Mode 2 : reCAPTCHA intégré (sans clé externe)
  const payload = verifySignedPayload(captchaToken);
  if (!payload || payload.t !== 'captcha' || !payload.id) {
    throw new Error('Captcha expiré ou invalide. Veuillez recharger le captcha.');
  }
  if (usedCaptchaIds.has(payload.id)) {
    throw new Error('Ce captcha a déjà été utilisé. Veuillez en générer un nouveau.');
  }
  const cleanAns = String(captchaAnswer || '').trim().toUpperCase();
  if (!cleanAns || cleanAns !== payload.ans) {
    usedCaptchaIds.add(payload.id);
    throw new Error('Code de sécurité (captcha) incorrect.');
  }
  usedCaptchaIds.add(payload.id);
  if (usedCaptchaIds.size > 2000) {
    const first = usedCaptchaIds.values().next().value;
    usedCaptchaIds.delete(first);
  }
  return true;
}
