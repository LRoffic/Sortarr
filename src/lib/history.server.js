import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const HISTORY_FILE = join(DATA_DIR, 'stats_history.json');
const MAX_DAYS = 365;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadHistoryStore() {
  ensureDataDir();
  if (!existsSync(HISTORY_FILE)) {
    const initial = { trackers: {} };
    writeFileSync(HISTORY_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    if (!parsed || typeof parsed.trackers !== 'object') {
      return { trackers: {} };
    }
    return parsed;
  } catch {
    return { trackers: {} };
  }
}

function saveHistoryStore(store) {
  ensureDataDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(store, null, 2));
}

/**
 * Enregistre un instantané quotidien pour chaque indexeur enrichi ayant des stats valides.
 */
export function recordDailyStats(enrichedIndexers, date = new Date()) {
  if (!Array.isArray(enrichedIndexers) || enrichedIndexers.length === 0) return;
  const store = loadHistoryStore();
  const todayKey = getLocalDateKey(date);
  const nowIso = date.toISOString();
  let changed = false;

  for (const idx of enrichedIndexers) {
    const t = idx?.tracker;
    if (!t || t.error || t.public) continue;
    if (
      t.ratio === null &&
      !t.infinite &&
      t.uploaded === null &&
      t.downloaded === null &&
      t.seedbonus === null
    ) {
      continue;
    }

    const idKey = String(idx.id);
    if (!store.trackers[idKey]) {
      store.trackers[idKey] = {
        id: idx.id,
        name: idx.name,
        definitionName: idx.definitionName || '',
        days: {}
      };
    } else {
      store.trackers[idKey].name = idx.name;
      if (idx.definitionName) store.trackers[idKey].definitionName = idx.definitionName;
      if (!store.trackers[idKey].days) store.trackers[idKey].days = {};
    }

    const days = store.trackers[idKey].days;
    const existing = days[todayKey];

    const ratio = typeof t.ratio === 'number' && Number.isFinite(t.ratio) ? t.ratio : null;
    const uploaded = typeof t.uploaded === 'number' && Number.isFinite(t.uploaded) ? t.uploaded : null;
    const downloaded = typeof t.downloaded === 'number' && Number.isFinite(t.downloaded) ? t.downloaded : null;
    const buffer = typeof t.buffer === 'number' && Number.isFinite(t.buffer) ? t.buffer : null;
    const rawPts = t.points ?? t.seedbonus;
    const seedbonus = typeof rawPts === 'number' && Number.isFinite(rawPts) ? rawPts : null;

    days[todayKey] = {
      date: todayKey,
      updatedAt: nowIso,
      ratio,
      infinite: !!t.infinite,
      uploaded,
      downloaded,
      buffer,
      seedbonus,
      freeleech: !!t.freeleech,
      startRatio: existing?.startRatio !== undefined ? existing.startRatio : ratio,
      startUploaded: existing?.startUploaded !== undefined ? existing.startUploaded : uploaded,
      startDownloaded: existing?.startDownloaded !== undefined ? existing.startDownloaded : downloaded,
      startBuffer: existing?.startBuffer !== undefined ? existing.startBuffer : buffer,
      startSeedbonus: existing?.startSeedbonus !== undefined ? existing.startSeedbonus : seedbonus
    };

    // Purge au-delà de MAX_DAYS
    const sortedDates = Object.keys(days).sort();
    if (sortedDates.length > MAX_DAYS) {
      const toRemove = sortedDates.slice(0, sortedDates.length - MAX_DAYS);
      for (const oldKey of toRemove) {
        delete days[oldKey];
      }
    }

    changed = true;
  }

  if (changed) {
    saveHistoryStore(store);
  }
}

/**
 * Retourne l'historique enrichi avec les variations journalières (deltas) pour l'affichage.
 */
export function getFormattedStatsHistory(currentIndexers = []) {
  const store = loadHistoryStore();
  const allDatesSet = new Set();

  // Synchronise les noms avec les indexeurs actuels
  const currentMap = new Map(currentIndexers.map((i) => [String(i.id), i]));

  const trackersList = [];

  for (const [idKey, entry] of Object.entries(store.trackers)) {
    const currentIdx = currentMap.get(idKey);
    const name = currentIdx?.name || entry.name || `Tracker #${idKey}`;
    const definitionName = currentIdx?.definitionName || entry.definitionName || '';
    const sortedDates = Object.keys(entry.days || {}).sort(); // ordre chronologique croissant

    if (sortedDates.length === 0) continue;

    const historyAsc = [];
    for (let i = 0; i < sortedDates.length; i++) {
      const dKey = sortedDates[i];
      allDatesSet.add(dKey);
      const cur = entry.days[dKey];
      const prev = i > 0 ? entry.days[sortedDates[i - 1]] : null;

      // Si pas de jour précédent, utilise la valeur de début de journée (intraday)
      const baseRatio = prev ? prev.ratio : cur.startRatio;
      const baseUp = prev ? prev.uploaded : cur.startUploaded;
      const baseDown = prev ? prev.downloaded : cur.startDownloaded;
      const baseBuf = prev ? prev.buffer : cur.startBuffer;
      const baseBonus = prev ? prev.seedbonus : cur.startSeedbonus;

      const deltaRatio =
        cur.ratio !== null && baseRatio !== null && baseRatio !== undefined
          ? Number((cur.ratio - baseRatio).toFixed(4))
          : null;
      const deltaUploaded =
        cur.uploaded !== null && baseUp !== null && baseUp !== undefined
          ? cur.uploaded - baseUp
          : null;
      const deltaDownloaded =
        cur.downloaded !== null && baseDown !== null && baseDown !== undefined
          ? cur.downloaded - baseDown
          : null;
      const deltaBuffer =
        cur.buffer !== null && baseBuf !== null && baseBuf !== undefined
          ? cur.buffer - baseBuf
          : null;
      const deltaSeedbonus =
        cur.seedbonus !== null && baseBonus !== null && baseBonus !== undefined
          ? Number((cur.seedbonus - baseBonus).toFixed(2))
          : null;

      historyAsc.push({
        ...cur,
        deltaRatio,
        deltaUploaded,
        deltaDownloaded,
        deltaBuffer,
        deltaSeedbonus
      });
    }

    const latest = historyAsc[historyAsc.length - 1];
    trackersList.push({
      id: entry.id ?? Number(idKey),
      name,
      definitionName,
      latest,
      historyAsc,
      historyDesc: [...historyAsc].reverse()
    });
  }

  // Tri par ordre alphabétique ou par priorité actuelle
  trackersList.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const allDatesDesc = Array.from(allDatesSet).sort().reverse();

  return {
    trackers: trackersList,
    datesDesc: allDatesDesc
  };
}
