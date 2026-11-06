/**
 * Background auto-sort scheduler (server-side singleton)
 * Runs independently of user browser sessions.
 */

import { getConfig } from './config.server.js';
import { updateIndexerPriority } from './prowlarr.server.js';
import { getEnrichedIndexers } from './indexers.server.js';
import { sortIndexers } from './sorting.js';
import { syncAllTags } from './arr.server.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const LOG_FILE = join(DATA_DIR, 'autosort.log');

let schedulerTimer = null;
let statsSnapshotTimer = null;
let lastRun = null;
let lastRunStatus = null;
let isSortingRunning = false;

async function collectDailySnapshotOnly() {
  const config = getConfig();
  if (!config.prowlarrApiKey) return;
  try {
    await getEnrichedIndexers({ force: true });
  } catch {
    // ignore background snapshot errors
  }
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try {
    ensureDataDir();
    writeFileSync(LOG_FILE, line, { flag: 'a' });
  } catch { /* ignore log errors */ }
  console.log('[Sortarr Scheduler]', msg);
}

/**
 * Execute one auto-sort cycle: fetch → sort → push to Prowlarr.
 */
export async function runAutoSort() {
  const config = getConfig();
  if (!config.prowlarrApiKey) {
    log('Skipped: no API key configured');
    return { ok: false, reason: 'no_config' };
  }

  if (isSortingRunning) {
    log('Cycle déjà en cours d’exécution, ignoré.');
    return { ok: false, reason: 'already_running' };
  }

  isSortingRunning = true;
  log('Starting auto-sort cycle...');
  try {
    const sorted = sortIndexers(await getEnrichedIndexers({ force: true }));
    const errors = [];

    for (let i = 0; i < sorted.length; i++) {
      const { tracker, ...idx } = sorted[i];
      const newPriority = i + 1;
      if (idx.priority === newPriority) continue; // no change needed
      try {
        await updateIndexerPriority(config.prowlarrUrl, config.prowlarrApiKey, {
          ...idx,
          priority: newPriority
        });
      } catch (e) {
        errors.push(`${idx.name}: ${e.message}`);
      }
    }

    if (config.taggingEnabled) {
      try {
        log('Syncing tags (Prowlarr / Radarr / Sonarr)...');
        const tagReport = await syncAllTags(sorted);
        log(`Tag sync done (Prowlarr: +${tagReport.prowlarr.tagged}/-${tagReport.prowlarr.untagged}, Radarr: +${tagReport.radarr.tagged}/-${tagReport.radarr.untagged}, Sonarr: +${tagReport.sonarr.tagged}/-${tagReport.sonarr.untagged})`);
      } catch (te) {
        log(`Tag sync error: ${te.message}`);
        errors.push(`Tag sync: ${te.message}`);
      }
    }

    lastRun = new Date();
    if (errors.length === 0) {
      lastRunStatus = { ok: true, updated: sorted.length };
      log(`Done. ${sorted.length} indexer(s) processed.`);
    } else {
      lastRunStatus = { ok: false, errors };
      log(`Done with errors: ${errors.join(', ')}`);
    }
    return lastRunStatus;
  } catch (e) {
    lastRunStatus = { ok: false, errors: [e.message] };
    log(`Error: ${e.message}`);
    return lastRunStatus;
  } finally {
    isSortingRunning = false;
  }
}

/**
 * Stop the background scheduler timers cleanly.
 */
export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (!statsSnapshotTimer) {
    clearInterval(statsSnapshotTimer);
    statsSnapshotTimer = null;
  }
  log('Scheduler arrêté proprement.');
}

/**
 * Start (or restart) the scheduler based on current config.
 */
export function restartScheduler() {
  // Clear any existing timer
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (!statsSnapshotTimer) {
    // Collecte quotidienne des ratios toutes les heures même si l'auto-tri est désactivé
    statsSnapshotTimer = setInterval(() => collectDailySnapshotOnly(), 60 * 60 * 1000);
  }

  const config = getConfig();

  if (!config.autoSortEnabled) {
    log('Auto-sort disabled — scheduler stopped.');
    collectDailySnapshotOnly();
    return;
  }

  const intervalMs = Math.max(5, config.autoSortInterval ?? 20) * 60 * 1000;
  log(`Scheduler started — interval: ${config.autoSortInterval ?? 20} min`);

  // Run immediately on start, then on interval
  runAutoSort().catch((err) => console.warn('[Sortarr Scheduler] Erreur cycle immédiat :', err?.message || err));
  schedulerTimer = setInterval(() => {
    runAutoSort().catch((err) => console.warn('[Sortarr Scheduler] Erreur cycle planifié :', err?.message || err));
  }, intervalMs);
}

/**
 * Get scheduler status for API/UI display.
 */
export function getSchedulerStatus() {
  const config = getConfig();
  return {
    enabled: config.autoSortEnabled ?? false,
    intervalMinutes: config.autoSortInterval ?? 20,
    lastRun: lastRun?.toISOString() ?? null,
    lastRunStatus,
    running: schedulerTimer !== null
  };
}

// Auto-start when module is first imported (on server boot)
restartScheduler();
