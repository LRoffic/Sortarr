/**
 * Module de gestion des paliers de statistiques (Ratio, Upload, Download, Buffer, Points, Astra, Seeds).
 * Supporte le mode 'global' (paliers partagés) et le mode 'tracker' (paliers personnalisés par tracker).
 */

export const DEFAULT_PALIERS = {
  ratio: 4.0,
  uploadGB: 2048,   // 2 To (en Go)
  downloadGB: 2048, // 2 To (en Go)
  bufferGB: 1024,   // 1 To (en Go)
  points: 25000,    // Points / Karma / Zen
  astra: 1000,      // Monnaie site (ex: Astra)
  seeds: 150        // Nombre de torrents en seed
};

/**
 * Normalise un objet de paliers en s'assurant que chaque valeur est un nombre positif valide.
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} fallback
 * @returns {typeof DEFAULT_PALIERS}
 */
export function normalizePaliers(raw = {}, fallback = DEFAULT_PALIERS) {
  const parseNum = (val, fb, min = 0) => {
    if (val === null || val === undefined || val === '') return fb;
    const n = Number(val);
    return Number.isFinite(n) && n > min ? n : fb;
  };

  return {
    ratio: parseNum(raw.ratio, fallback.ratio ?? DEFAULT_PALIERS.ratio, 0),
    uploadGB: parseNum(raw.uploadGB, fallback.uploadGB ?? DEFAULT_PALIERS.uploadGB, 0),
    downloadGB: parseNum(raw.downloadGB, fallback.downloadGB ?? DEFAULT_PALIERS.downloadGB, 0),
    bufferGB: parseNum(raw.bufferGB, fallback.bufferGB ?? DEFAULT_PALIERS.bufferGB, 0),
    points: parseNum(raw.points, fallback.points ?? DEFAULT_PALIERS.points, 0),
    astra: parseNum(raw.astra, fallback.astra ?? DEFAULT_PALIERS.astra, 0),
    seeds: Math.round(parseNum(raw.seeds, fallback.seeds ?? DEFAULT_PALIERS.seeds, 0))
  };
}

/**
 * Récupère les paliers effectifs pour un tracker donné.
 * Si le mode est 'tracker' et que le tracker a configuré ses propres paliers, on les utilise.
 * Sinon, on utilise les paliers globaux configurés (ou les valeurs par défaut).
 *
 * @param {string|number|null} trackerId
 * @param {{ mode?: string, global?: any }} statsPaliersConfig
 * @param {Record<string, any>} [trackersConfig]
 * @returns {typeof DEFAULT_PALIERS}
 */
export function getEffectivePaliers(trackerId, statsPaliersConfig, trackersConfig = {}) {
  const mode = statsPaliersConfig?.mode === 'tracker' ? 'tracker' : 'global';
  const globalPaliers = normalizePaliers(statsPaliersConfig?.global, DEFAULT_PALIERS);

  if (mode === 'global' || !trackerId) {
    return globalPaliers;
  }

  const trackerConf = trackersConfig[trackerId] || trackersConfig[String(trackerId)];
  const trackerPaliers = trackerConf?.paliers;

  if (!trackerPaliers || typeof trackerPaliers !== 'object') {
    return globalPaliers;
  }

  // Fusion avec les paliers globaux comme fallback pour les champs non renseignés
  return normalizePaliers(trackerPaliers, globalPaliers);
}

/**
 * Formate un nombre de Go en chaîne lisible (Go ou To).
 * Ex: 2048 -> "2 To", 1024 -> "1 To", 500 -> "500 Go", 1500 -> "1.5 To"
 * @param {number} gb
 * @returns {string}
 */
export function formatPalierGB(gb) {
  if (!gb || gb <= 0) return '0 Go';
  if (gb >= 1024) {
    const to = gb / 1024;
    return to % 1 === 0 ? `${to} To` : `${to.toFixed(1)} To`;
  }
  return `${gb} Go`;
}

/**
 * Calcule les métriques d'affichage de la barre de progression et du tooltip pour chaque indicateur.
 */
export function computeStatProgress({
  ratio,
  uploaded,
  downloaded,
  buffer,
  points,
  astra,
  seeds,
  isInfinite = false,
  paliers = DEFAULT_PALIERS,
  pointsLabel = 'POINTS'
}) {
  const safePaliers = normalizePaliers(paliers, DEFAULT_PALIERS);

  // 1. Ratio
  const ratioVal = ratio !== null && Number.isFinite(ratio) ? ratio : 0;
  const ratioTarget = safePaliers.ratio;
  const ratioPct = isInfinite ? 100 : Math.min(100, Math.round((ratioVal / ratioTarget) * 100));
  const ratioWidth = isInfinite ? 100 : Math.min(100, Math.max(12, Math.round((ratioVal / ratioTarget) * 100)));
  const ratioTooltip = isInfinite
    ? 'Ratio : ∞ (Illimité)'
    : `Ratio : ${ratioVal.toFixed(2)} / ${ratioTarget.toFixed(1)} (${ratioPct}% de l'objectif)`;

  // 2. Upload
  const uploadBytesTarget = safePaliers.uploadGB * 1024 ** 3;
  const upVal = uploaded !== null && Number.isFinite(uploaded) ? uploaded : 0;
  const uploadPct = Math.min(100, Math.round((upVal / uploadBytesTarget) * 100));
  const uploadWidth = Math.min(100, Math.max(12, uploadPct));
  const uploadTargetStr = formatPalierGB(safePaliers.uploadGB);

  // 3. Download
  const downBytesTarget = safePaliers.downloadGB * 1024 ** 3;
  const downVal = downloaded !== null && Number.isFinite(downloaded) ? downloaded : 0;
  const downloadPct = Math.min(100, Math.round((downVal / downBytesTarget) * 100));
  const downloadWidth = Math.min(100, Math.max(12, downloadPct));
  const downloadTargetStr = formatPalierGB(safePaliers.downloadGB);

  // 4. Buffer
  const bufferBytesTarget = safePaliers.bufferGB * 1024 ** 3;
  const bufVal = buffer !== null && Number.isFinite(buffer) ? Math.abs(buffer) : 0;
  const bufferPct = isInfinite && buffer === null ? 100 : Math.min(100, Math.round((bufVal / bufferBytesTarget) * 100));
  const bufferWidth = isInfinite && buffer === null ? 100 : Math.min(100, Math.max(12, bufferPct));
  const bufferTargetStr = formatPalierGB(safePaliers.bufferGB);
  const bufferTooltip = isInfinite && buffer === null
    ? 'Buffer : ∞ (Illimité)'
    : `Buffer : ${bufVal > 0 ? (buffer < 0 ? '-' : '') : ''}${formatPalierGB(Math.round(bufVal / 1024 ** 3))} / ${bufferTargetStr} (${bufferPct}% du palier)`;

  // 5. Points / Karma
  const ptsVal = points !== null && Number.isFinite(points) ? points : 0;
  const ptsTarget = safePaliers.points;
  const pointsPct = Math.min(100, Math.round((ptsVal / ptsTarget) * 100));
  const pointsWidth = Math.min(100, Math.max(12, pointsPct));

  // 6. Astra
  const astraVal = astra !== null && Number.isFinite(astra) ? astra : 0;
  const astraTarget = safePaliers.astra;
  const astraPct = Math.min(100, Math.round((astraVal / astraTarget) * 100));
  const astraWidth = Math.min(100, Math.max(12, astraPct));

  // 7. Seeds
  const seedsVal = seeds !== null && Number.isFinite(seeds) ? seeds : 0;
  const seedsTarget = safePaliers.seeds;
  const seedsPct = Math.min(100, Math.round((seedsVal / seedsTarget) * 100));
  const seedsWidth = Math.min(100, Math.max(12, seedsPct));

  return {
    safePaliers,
    ratio: { pct: ratioPct, width: ratioWidth, tooltip: ratioTooltip, target: ratioTarget },
    upload: { pct: uploadPct, width: uploadWidth, targetStr: uploadTargetStr, targetBytes: uploadBytesTarget },
    download: { pct: downloadPct, width: downloadWidth, targetStr: downloadTargetStr, targetBytes: downBytesTarget },
    buffer: { pct: bufferPct, width: bufferWidth, targetStr: bufferTargetStr, targetBytes: bufferBytesTarget, tooltip: bufferTooltip },
    points: { pct: pointsPct, width: pointsWidth, target: ptsTarget },
    astra: { pct: astraPct, width: astraWidth, target: astraTarget },
    seeds: { pct: seedsPct, width: seedsWidth, target: seedsTarget }
  };
}
