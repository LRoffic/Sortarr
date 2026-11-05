/**
 * Service de télémétrie anonyme pour Sortarr
 * Endpoint: https://tele-sortarr.lripsum.net/api/v1/telemetry
 *
 * Toutes les données sont strictement anonymisées (aucun nom, IP, URL ou tracker n'est transmis).
 * L'objectif est d'avoir une visibilité sur les versions et environnements déployés.
 */
import os from 'node:os';
import fs from 'node:fs';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { getConfig } from './config.server.js';
import { getCurrentVersion } from './updater.server.js';

export const TELEMETRY_URL = 'https://tele-sortarr.lripsum.net/api/v1/telemetry';

/**
 * Normalise le nom de l'OS (linux, windows, macos)
 */
export function getNormalizedOs() {
  const platform = os.platform();
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return platform; // 'linux', 'freebsd', etc.
}

/**
 * Détecte si Sortarr s'exécute dans un conteneur Docker
 */
export function isDockerEnvironment() {
  try {
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) {
      return true;
    }
    if (process.env.DOCKER === 'true' || process.env.IS_DOCKER === 'true') {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Détermine la branche / canal Git ou 'main' par défaut
 */
export function getGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    if (branch && branch !== 'HEAD') {
      return branch;
    }
  } catch {}
  return 'main';
}

/**
 * Construit le payload de télémétrie anonyme
 * @param {{ isTest?: boolean }} [options]
 */
export function buildTelemetryPayload({ isTest = false } = {}) {
  const config = getConfig();
  const version = getCurrentVersion();

  return {
    instance_id: config.instanceId,
    version,
    os: getNormalizedOs(),
    arch: os.arch(),
    is_docker: isDockerEnvironment(),
    branch: getGitBranch(),
    is_test: Boolean(isTest)
  };
}

/**
 * Envoie un ping de télémétrie anonyme vers le serveur de télémétrie Sortarr.
 * Échec silencieux garanti : cette fonction n'interrompt JAMAIS le fonctionnement de l'application.
 *
 * @param {{ isTest?: boolean, force?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, data?: any, error?: string }>}
 */
export async function sendTelemetryPing({ isTest = false, force = false } = {}) {
  try {
    const config = getConfig();

    // Respect du choix de l'utilisateur : ne pas envoyer si désactivé (sauf test explicite)
    if (!force && !isTest && config.telemetryEnabled === false) {
      return { ok: true, skipped: true, reason: 'telemetry_disabled' };
    }

    const payload = buildTelemetryPayload({ isTest });
    const payloadStr = JSON.stringify(payload);

    return await new Promise((resolve) => {
      const parsed = new URL(TELEMETRY_URL);
      const req = https.request(
        parsed,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadStr),
            'User-Agent': `Sortarr-Telemetry/${payload.version}`
          },
          rejectUnauthorized: false,
          timeout: 6000
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            let data = null;
            try {
              data = JSON.parse(body);
            } catch {
              data = { raw: body };
            }
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              data
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout de connexion au serveur de télémétrie' });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      req.write(payloadStr);
      req.end();
    });
  } catch (err) {
    // Échec silencieux
    return { ok: false, error: err.message };
  }
}
