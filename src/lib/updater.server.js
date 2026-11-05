/**
 * Système de vérification et d'installation des mises à jour
 * depuis les Releases GitHub : https://github.com/LRoffic/Sortarr
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const GITHUB_REPO = 'LRoffic/Sortarr';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
const PACKAGE_JSON_PATH = path.resolve('package.json');

let updateCache = {
  checkedAt: 0,
  data: null
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Lit la version actuelle depuis package.json */
export function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    return String(pkg.version || '1.0.0').replace(/^v/i, '');
  } catch {
    return '1.0.0';
  }
}

/** Normalise une version "v1.2.3" -> [1, 2, 3] */
function parseSemver(v) {
  const clean = String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** Retourne > 0 si b > a, < 0 si b < a, 0 si identiques */
export function compareVersions(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pb[i] !== pa[i]) return pb[i] - pa[i];
  }
  return 0;
}

/** Requête HTTPS JSON tolérante aux certificats système (Node v26 Windows) */
function fetchGithubJson(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Sortarr-Updater/1.0 (+https://github.com/LRoffic/Sortarr)',
          Accept: 'application/vnd.github+json'
        },
        rejectUnauthorized: false,
        timeout: 12000
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          resolve(fetchGithubJson(new URL(res.headers.location, parsed).toString()));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            data: json
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout lors de la connexion à GitHub API')));
    req.on('error', reject);
    req.end();
  });
}

/** Télécharge un fichier binaire en suivant les redirections (ex: tarball GitHub) */
function downloadFile(urlStr, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      parsed,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Sortarr-Updater/1.0 (+https://github.com/LRoffic/Sortarr)'
        },
        rejectUnauthorized: false,
        timeout: 30000
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
          resolve(downloadFile(nextUrl, destPath, maxRedirects - 1));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`Échec du téléchargement (HTTP ${res.statusCode})`));
          return;
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(resolve);
        });
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout téléchargement archive')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Vérifie la dernière release disponible sur https://github.com/LRoffic/Sortarr/releases
 */
export async function checkForUpdates({ force = false } = {}) {
  const currentVersion = getCurrentVersion();
  if (!force && updateCache.data && Date.now() - updateCache.checkedAt < CACHE_TTL_MS) {
    return {
      ...updateCache.data,
      currentVersion,
      updateAvailable: compareVersions(currentVersion, updateCache.data.latestVersion) > 0
    };
  }

  try {
    // 1. Récupère la liste des releases GitHub (jusqu'à 30) pour l'historique complet
    let listRes = await fetchGithubJson(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`);
    let allReleases = (listRes.ok && Array.isArray(listRes.data)) ? listRes.data : [];

    // 2. Cherche la dernière release stable
    let release = allReleases.find((r) => !r.draft && !r.prerelease) || allReleases[0];
    if (!release) {
      let relRes = await fetchGithubJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
      if (relRes.ok && relRes.data?.tag_name) {
        release = relRes.data;
        allReleases = [release];
      }
    }

    if (!release || !release.tag_name) {
      const noReleaseData = {
        ok: true,
        repo: GITHUB_REPO,
        repoUrl: GITHUB_REPO_URL,
        currentVersion,
        latestVersion: currentVersion,
        tagName: null,
        updateAvailable: false,
        noReleasesYet: true,
        releaseName: null,
        releaseNotes: 'Aucune release publiée sur le dépôt GitHub pour le moment.',
        publishedAt: null,
        htmlUrl: `${GITHUB_REPO_URL}/releases`,
        releases: [],
        checkedAt: new Date().toISOString()
      };
      updateCache = { checkedAt: Date.now(), data: noReleaseData };
      return noReleaseData;
    }

    const latestVersion = String(release.tag_name).replace(/^v/i, '');
    const updateAvailable = compareVersions(currentVersion, latestVersion) > 0;

    const releasesList = allReleases.map((r) => ({
      tagName: r.tag_name,
      version: String(r.tag_name).replace(/^v/i, ''),
      name: r.name || r.tag_name,
      releaseNotes: r.body || '',
      publishedAt: r.published_at || r.created_at || null,
      htmlUrl: r.html_url || `${GITHUB_REPO_URL}/releases/tag/${r.tag_name}`,
      isCurrent: String(r.tag_name).replace(/^v/i, '') === currentVersion,
      isLatest: String(r.tag_name) === String(release.tag_name)
    }));

    const result = {
      ok: true,
      repo: GITHUB_REPO,
      repoUrl: GITHUB_REPO_URL,
      currentVersion,
      latestVersion,
      tagName: release.tag_name,
      updateAvailable,
      noReleasesYet: false,
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || release.created_at || null,
      htmlUrl: release.html_url || `${GITHUB_REPO_URL}/releases/tag/${release.tag_name}`,
      tarballUrl: release.tarball_url || `https://api.github.com/repos/${GITHUB_REPO}/tarball/${release.tag_name}`,
      zipballUrl: release.zipball_url || `https://api.github.com/repos/${GITHUB_REPO}/zipball/${release.tag_name}`,
      releases: releasesList,
      checkedAt: new Date().toISOString()
    };

    updateCache = { checkedAt: Date.now(), data: result };
    return result;
  } catch (e) {
    return {
      ok: false,
      error: `Impossible de vérifier les mises à jour GitHub : ${e.message}`,
      repo: GITHUB_REPO,
      repoUrl: GITHUB_REPO_URL,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      htmlUrl: `${GITHUB_REPO_URL}/releases`,
      checkedAt: new Date().toISOString()
    };
  }
}

/**
 * Télécharge et applique la dernière release depuis GitHub,
 * met à jour package.json, installe les dépendances et reconstruit le projet.
 */
export async function performUpdate() {
  const logs = [];
  const log = (step, detail = '') => {
    logs.push({ time: new Date().toLocaleTimeString('fr-FR'), step, detail });
  };

  const check = await checkForUpdates({ force: true });
  if (!check.ok) {
    throw new Error(check.error || 'Échec de vérification de la release GitHub');
  }
  if (check.noReleasesYet || !check.tagName) {
    throw new Error('Aucune release n’est encore publiée sur https://github.com/LRoffic/Sortarr/releases');
  }

  const targetTag = check.tagName;
  const targetVersion = check.latestVersion;

  // Validation de sécurité stricte pour prévenir toute injection dans les commandes shell
  if (!/^[a-zA-Z0-9._-]+$/.test(targetTag) || targetTag.startsWith('-')) {
    throw new Error('Nom de tag de release invalide ou non sécurisé');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(targetVersion)) {
    throw new Error('Format de numéro de version invalide');
  }

  log(`Release cible détectée : ${targetTag} (v${targetVersion})`);

  const rootDir = process.cwd();
  const hasGit = fs.existsSync(path.join(rootDir, '.git'));
  let updatedFilesViaGit = false;

  if (hasGit) {
    try {
      log('Récupération des tags depuis GitHub (git fetch --tags)...');
      const { stdout: fetchOut, stderr: fetchErr } = await execAsync(
        `git fetch origin --tags --force`,
        { cwd: rootDir, timeout: 60000 }
      );
      log('git fetch terminé', (fetchOut || fetchErr).trim());

      log(`Application de la release ${targetTag} (git reset --hard ${targetTag})...`);
      const { stdout: coOut, stderr: coErr } = await execAsync(
        `git reset --hard ${targetTag}`,
        { cwd: rootDir, timeout: 30000 }
      );
      log('Fichiers mis à jour via Git', (coOut || coErr).trim());
      updatedFilesViaGit = true;
    } catch (gitErr) {
      log('Avertissement Git — bascule sur le téléchargement de l’archive release', gitErr.message);
    }
  }

  if (!updatedFilesViaGit) {
    const tmpTar = path.join(rootDir, `sortarr-update-${Date.now()}.tar.gz`);
    try {
      log(`Téléchargement de l'archive de release (${check.tarballUrl})...`);
      await downloadFile(check.tarballUrl, tmpTar);
      log('Extraction de l’archive (le dossier data/ est préservé)...');
      await execAsync(`tar -xzf "${tmpTar}" --strip-components=1 --exclude="data"`, {
        cwd: rootDir,
        timeout: 60000
      });
      log('Archive extraite avec succès');
    } finally {
      if (fs.existsSync(tmpTar)) {
        try { fs.unlinkSync(tmpTar); } catch {}
      }
    }
  }

  // S'assure que la version dans package.json correspond bien au tag installé
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    if (pkg.version !== targetVersion) {
      pkg.version = targetVersion;
      fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      log(`Version dans package.json synchronisée sur ${targetVersion}`);
    }
  } catch {}

  // Installation des dépendances et build de production
  // Note: On force --include=dev et NODE_ENV=development pour s'assurer que les outils
  // de compilation (Vite, Tailwind, etc.) sont bien installés même si le serveur tourne en NODE_ENV=production.
  log('Installation des dépendances (npm install --include=dev)...');
  const { stdout: npmOut } = await execAsync('npm install --include=dev --no-audit --no-fund', {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'development' },
    timeout: 180000
  });
  log('Dépendances à jour', npmOut.trim().slice(-400));

  log('Compilation de la nouvelle version (npm run build)...');
  const { stdout: buildOut } = await execAsync('npm run build', {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 180000
  });
  log('Build terminé avec succès', buildOut.trim().slice(-400));

  // Signal de redémarrage pour Phusion Passenger / cPanel / Plesk (Node.js Selector)
  try {
    const tmpDir = path.join(rootDir, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'restart.txt'), String(Date.now()));
    log('Signal de redémarrage Phusion Passenger envoyé (tmp/restart.txt)');
  } catch {}

  // Si l'application est gérée par PM2 ou un gestionnaire de processus,
  // programmer un redémarrage gracieux après la fin de la réponse HTTP
  setTimeout(() => {
    try {
      if (typeof process.send === 'function') {
        // Mode PM2 cluster
        process.send('restart');
      }
    } catch {}
  }, 1000);

  // Invalide le cache
  updateCache = { checkedAt: 0, data: null };
  const updatedStatus = await checkForUpdates({ force: true });

  return {
    ok: true,
    previousVersion: check.currentVersion,
    installedVersion: targetVersion,
    tagName: targetTag,
    logs,
    status: updatedStatus
  };
}

let contributorsCache = {
  checkedAt: 0,
  data: null
};

/**
 * Récupère la liste des contributeurs du dépôt GitHub
 */
export async function getContributors({ force = false } = {}) {
  const now = Date.now();
  if (!force && contributorsCache.data && now - contributorsCache.checkedAt < CACHE_TTL_MS) {
    return contributorsCache.data;
  }

  try {
    const res = await fetchGithubJson(
      `https://api.github.com/repos/${GITHUB_REPO}/contributors?per_page=100`
    );
    if (res.ok && Array.isArray(res.data)) {
      const contributors = res.data.map((c) => ({
        login: c.login,
        avatarUrl: c.avatar_url,
        htmlUrl: c.html_url,
        contributions: c.contributions || 0,
        type: c.type || 'User'
      }));
      contributorsCache = {
        checkedAt: now,
        data: {
          ok: true,
          repo: GITHUB_REPO,
          repoUrl: GITHUB_REPO_URL,
          contributors
        }
      };
      return contributorsCache.data;
    }
  } catch (e) {
    if (contributorsCache.data) return contributorsCache.data;
  }

  // Fallback si l'API GitHub est injoignable ou limite atteinte
  const fallback = [
    {
      login: 'LRoffic',
      avatarUrl: 'https://avatars.githubusercontent.com/u/4381940?v=4',
      htmlUrl: 'https://github.com/LRoffic',
      contributions: 30,
      type: 'User'
    }
  ];

  return {
    ok: true,
    repo: GITHUB_REPO,
    repoUrl: GITHUB_REPO_URL,
    contributors: fallback,
    fromFallback: true
  };
}
