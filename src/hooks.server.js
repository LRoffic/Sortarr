/**
 * SvelteKit server hook — runs once at server startup.
 * Initialises the background auto-sort scheduler and enforces mandatory authentication.
 */
import { redirect, json } from '@sveltejs/kit';
import { restartScheduler } from '$lib/scheduler.server.js';
import { hasUsers, verifySessionToken, SESSION_COOKIE } from '$lib/auth.server.js';

// Permettre les connexions TLS aux instances locales et aux reverse proxies internes (certificats auto-signés)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Kick off the scheduler when the server boots
restartScheduler();

const PUBLIC_AUTH_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/captcha',
  '/api/auth/verify-2fa'
]);

function applySecurityHeaders(response) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { pathname } = event.url;
  const registered = hasUsers();
  const token = event.cookies.get(SESSION_COOKIE);
  const user = registered ? verifySessionToken(token) : null;

  event.locals.user = user;
  event.locals.hasUsers = registered;

  // Autoriser uniquement les routes d'API d'authentification publiques sans session
  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    const response = await resolve(event);
    return applySecurityHeaders(response);
  }

  // 1) Aucun utilisateur enregistré -> rediriger vers /register
  if (!registered) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(json({ ok: false, error: 'Configuration initiale requise (/register)' }, { status: 401 }));
    }
    if (pathname !== '/register') {
      throw redirect(302, '/register');
    }
    const response = await resolve(event);
    return applySecurityHeaders(response);
  }

  // 2) Un utilisateur existe déjà -> interdire l'accès à /register
  if (pathname === '/register') {
    throw redirect(302, user ? '/' : '/login');
  }

  // 3) Utilisateur non connecté -> rediriger vers /login
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(json({ ok: false, error: 'Authentification requise' }, { status: 401 }));
    }
    if (pathname !== '/login') {
      throw redirect(302, '/login');
    }
    const response = await resolve(event);
    return applySecurityHeaders(response);
  }

  // 4) Utilisateur déjà connecté qui visite /login -> rediriger vers /
  if (pathname === '/login') {
    throw redirect(302, '/');
  }

  const response = await resolve(event);
  return applySecurityHeaders(response);
}
