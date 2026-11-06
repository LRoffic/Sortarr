/**
 * Gestionnaire du cycle de vie du serveur et des signaux de redémarrage à chaud (Hot Restart).
 * Compatible OpenLiteSpeed (OLS), CyberPanel, LiteSpeed Web Server, cPanel / Phusion Passenger,
 * PM2, Docker et systemd.
 */
import fs from 'fs';
import path from 'path';
import { stopScheduler, restartScheduler } from './scheduler.server.js';
import { clearUpdateCache } from './updater.server.js';

let initialized = false;

/**
 * Crée ou met à jour le fichier tmp/restart.txt (standard Phusion Passenger & LiteSpeed).
 */
export function touchRestartFile() {
  try {
    const tmpDir = path.resolve('tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(path.join(tmpDir, 'restart.txt'), String(Date.now()));
    console.log('[Sortarr Lifecycle] Fichier tmp/restart.txt mis à jour avec succès.');
  } catch (err) {
    console.warn('[Sortarr Lifecycle] Impossible d’écrire tmp/restart.txt :', err.message);
  }
}

/**
 * Traite un signal de redémarrage à chaud (SIGHUP, SIGUSR1, SIGUSR2).
 */
export function handleHotRestart(signal) {
  console.log(`[Sortarr Lifecycle] Signal ${signal} reçu — déclenchement du redémarrage à chaud...`);

  // 1. Notifier les gestionnaires basés sur fichiers (Passenger, LiteSpeed)
  touchRestartFile();

  // 2. Nettoyer les caches internes
  try {
    clearUpdateCache();
  } catch {}

  // 3. Arrêter proprement les tâches de fond pour éviter les verrous de fichiers
  try {
    stopScheduler();
  } catch (err) {
    console.warn('[Sortarr Lifecycle] Erreur lors de l’arrêt du scheduler :', err.message);
  }

  // 4. Si nous sommes sous PM2 cluster, notifier le master
  try {
    if (typeof process.send === 'function') {
      process.send('restart');
    }
  } catch {}

  // 5. Terminaison gracieuse (drainage des requêtes en cours puis sortie propre)
  // Dans OpenLiteSpeed, CyberPanel, Passenger et Docker, la fin propre (code 0)
  // indique au superviseur de réinstancier immédiatement le processus avec le nouveau code compilé.
  console.log(`[Sortarr Lifecycle] Arrêt gracieux du worker en cours (sortie avec code 0)...`);
  setTimeout(() => {
    process.exit(0);
  }, 400);
}

/**
 * Déclenche un redémarrage à chaud depuis l'application (ex: après mise à jour GitHub).
 */
export function triggerHotRestart() {
  touchRestartFile();

  try {
    if (typeof process.send === 'function') {
      process.send('restart');
      return;
    }
  } catch {}

  if (process.platform !== 'win32') {
    try {
      // Émet SIGHUP en local vers notre propre processus
      process.kill(process.pid, 'SIGHUP');
      return;
    } catch {}
  }

  // Fallback universel : sortie gracieuse après un court délai pour terminer la réponse HTTP
  setTimeout(() => {
    try {
      stopScheduler();
    } catch {}
    process.exit(0);
  }, 1000);
}

/**
 * Initialise l'écoute des signaux POSIX de redémarrage à chaud et d'arrêt propre.
 */
export function initServerLifecycle() {
  if (initialized) return;
  initialized = true;

  // Sous Linux / Unix (OpenLiteSpeed, CyberPanel, cPanel, Docker, systemd)
  if (process.platform !== 'win32') {
    // SIGHUP : Rechargement / Redémarrage standard OpenLiteSpeed / LiteSpeed / POSIX
    try {
      process.on('SIGHUP', () => handleHotRestart('SIGHUP'));
    } catch (e) {
      console.warn('[Sortarr Lifecycle] Écouteur SIGHUP non disponible :', e.message);
    }

    // SIGUSR1 : Alternative de redémarrage gracieux
    try {
      process.on('SIGUSR1', () => handleHotRestart('SIGUSR1'));
    } catch (e) {
      console.warn('[Sortarr Lifecycle] Écouteur SIGUSR1 non disponible :', e.message);
    }

    // SIGUSR2 : Utilisé par nodemon / PM2 et certains gestionnaires de processus
    try {
      process.on('SIGUSR2', () => handleHotRestart('SIGUSR2'));
    } catch (e) {
      console.warn('[Sortarr Lifecycle] Écouteur SIGUSR2 non disponible :', e.message);
    }

    // SIGTERM & SIGINT : Arrêt propre
    try {
      process.on('SIGTERM', () => {
        console.log('[Sortarr Lifecycle] SIGTERM reçu — arrêt propre du serveur.');
        try { stopScheduler(); } catch {}
        process.exit(0);
      });
      process.on('SIGINT', () => {
        console.log('[Sortarr Lifecycle] SIGINT reçu — arrêt propre du serveur.');
        try { stopScheduler(); } catch {}
        process.exit(0);
      });
    } catch {}
  } else {
    // Windows (développement local)
    try {
      process.on('SIGINT', () => {
        console.log('[Sortarr Lifecycle] Arrêt Windows reçu (SIGINT).');
        try { stopScheduler(); } catch {}
        process.exit(0);
      });
    } catch {}
  }

  // Protection globale contre les interruptions inattendues par promesses ou erreurs réseau non gérées
  try {
    process.on('unhandledRejection', (reason) => {
      console.warn('[Sortarr Lifecycle] Rejet de promesse non intercepté (protégé pour préserver le serveur) :', reason?.message || reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('[Sortarr Lifecycle] Exception non interceptée (protégée pour préserver le serveur) :', err?.message || err);
    });
  } catch {}

  console.log('[Sortarr Lifecycle] Écouteurs de redémarrage à chaud initialisés (SIGHUP, SIGUSR1, SIGUSR2, tmp/restart.txt).');
}
