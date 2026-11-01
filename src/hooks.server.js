/**
 * SvelteKit server hook — runs once at server startup.
 * Initialises the background auto-sort scheduler and enforces mandatory authentication.
 */
import { redirect, json } from '@sveltejs/kit';
import { restartScheduler } from '$lib/scheduler.server.js';
import { hasUsers, verifySessionToken, SESSION_COOKIE } from '$lib/auth.server.js';

// Kick off the scheduler when the server boots
restartScheduler();

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { pathname } = event.url;
  const registered = hasUsers();
  const token = event.cookies.get(SESSION_COOKIE);
  const user = registered ? verifySessionToken(token) : null;

  event.locals.user = user;
  event.locals.hasUsers = registered;

  // Autoriser les routes d'API d'authentification
  if (pathname.startsWith('/api/auth/')) {
    return resolve(event);
  }

  // 1) Aucun utilisateur enregistré -> rediriger vers /register
  if (!registered) {
    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Configuration initiale requise (/register)' }, { status: 401 });
    }
    if (pathname !== '/register') {
      throw redirect(302, '/register');
    }
    return resolve(event);
  }

  // 2) Un utilisateur existe déjà -> interdire l'accès à /register
  if (pathname === '/register') {
    throw redirect(302, user ? '/' : '/login');
  }

  // 3) Utilisateur non connecté -> rediriger vers /login
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Authentification requise' }, { status: 401 });
    }
    if (pathname !== '/login') {
      throw redirect(302, '/login');
    }
    return resolve(event);
  }

  // 4) Utilisateur déjà connecté qui visite /login -> rediriger vers /
  if (pathname === '/login') {
    throw redirect(302, '/');
  }

  return resolve(event);
}
