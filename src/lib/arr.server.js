import { getConfig, saveConfig } from './config.server.js';
import { fetchIndexers, updateIndexerPriority } from './prowlarr.server.js';
import { getEnrichedIndexers } from './indexers.server.js';

/**
 * Normalise une chaîne pour comparaison souple de noms d'indexeurs
 * Supprime les mentions automatiques comme "(Prowlarr)" ajoutées par Prowlarr dans Radarr/Sonarr.
 */
function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\(prowlarr\)/gi, '')
    .replace(/\bprowlarr\b/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Tente d'extraire l'ID Prowlarr original depuis le champ baseUrl d'un indexeur Radarr/Sonarr.
 * Ex: "http://localhost:9696/8/" -> 8
 */
function extractProwlarrIdFromArrIndexer(arrIndexer) {
  if (!arrIndexer || !Array.isArray(arrIndexer.fields)) return null;
  const baseUrlField = arrIndexer.fields.find(
    (f) => f && f.name === 'baseUrl' && typeof f.value === 'string'
  );
  if (!baseUrlField) return null;
  const m = baseUrlField.value.match(/\/(\d+)\/?$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Test de connexion à Radarr ou Sonarr (API v3)
 */
export async function testArrConnection(url, apiKey, type = 'radarr') {
  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(apiKey || '').trim();
  if (!cleanUrl) return { ok: false, error: "L'URL est requise" };
  if (!cleanKey) return { ok: false, error: "La clé d'API est requise" };

  const endpoint = `${cleanUrl}/api/v3/system/status`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        'X-Api-Key': cleanKey,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const data = await res.json();
    return {
      ok: true,
      version: data.version || data.buildTime || 'inconnue',
      appName: data.appName || (type === 'sonarr' ? 'Sonarr' : 'Radarr')
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Vérifie l'existence d'un tag ou le crée s'il n'existe pas.
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {string} tagLabel ex: 'no-arr'
 * @param {'v1'|'v3'} apiVersion Prowlarr='v1', Radarr/Sonarr='v3'
 * @returns {Promise<number>} tagId
 */
export async function ensureTag(baseUrl, apiKey, tagLabel, apiVersion = 'v3') {
  const cleanUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const cleanKey = String(apiKey || '').trim();
  const label = String(tagLabel || '').trim();
  if (!cleanUrl || !cleanKey || !label) {
    throw new Error('URL, clé API et libellé de tag requis');
  }

  const tagEndpoint = `${cleanUrl}/api/${apiVersion}/tag`;
  const res = await fetch(tagEndpoint, {
    headers: {
      'X-Api-Key': cleanKey,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`Erreur lors de la lecture des tags (${apiVersion}): HTTP ${res.status}`);
  }

  const existingTags = await res.json();
  const found = Array.isArray(existingTags)
    ? existingTags.find((t) => String(t.label || '').toLowerCase() === label.toLowerCase())
    : null;

  if (found) {
    return found.id;
  }

  // Création du tag
  const createRes = await fetch(tagEndpoint, {
    method: 'POST',
    headers: {
      'X-Api-Key': cleanKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ label }),
    signal: AbortSignal.timeout(10000)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Impossible de créer le tag "${label}": HTTP ${createRes.status} - ${errText}`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Détermine si un indexeur doit recevoir le tag d'exclusion
 */
export function shouldTagIndexer(idx, config) {
  // 1. Tracker public -> jamais taggé
  if (idx.privacy === 'public' || idx.tracker?.public === true) {
    return { shouldTag: false, keepExisting: false, reason: 'Tracker public (pas de ratio)' };
  }

  // 2. Ratio infini -> jamais taggé
  if (idx.tracker?.infinite === true) {
    return { shouldTag: false, keepExisting: false, reason: 'Ratio infini (aucun risque)' };
  }

  // 3. Freeleech actif et exemption activée -> pas taggé
  const isFl = idx.tracker?.freeleech === true;
  if (config.taggingExcludeFreeleech && isFl) {
    return { shouldTag: false, keepExisting: false, reason: 'Freeleech actif (exempté)' };
  }

  // 4. Vérification du ratio réel
  const ratio = typeof idx.tracker?.ratio === 'number' && Number.isFinite(idx.tracker.ratio)
    ? idx.tracker.ratio
    : null;
  const threshold = typeof config.taggingRatioThreshold === 'number'
    ? config.taggingRatioThreshold
    : parseFloat(config.taggingRatioThreshold) || 1.0;

  if (ratio !== null) {
    if (ratio < threshold) {
      return {
        shouldTag: true,
        keepExisting: true,
        reason: `Ratio insuffisant (${ratio.toFixed(2)} < seuil ${threshold.toFixed(2)})`
      };
    } else {
      return {
        shouldTag: false,
        keepExisting: false,
        reason: `Ratio suffisant (${ratio.toFixed(2)} >= seuil ${threshold.toFixed(2)})`
      };
    }
  }

  // 5. Sans stats de ratio connues ou erreur temporaire de récupération :
  // SÉCURITÉ CRITIQUE : on ne retire JAMAIS un tag existant si on n'a pas la confirmation
  // formelle que le ratio est >= seuil ! Si l'indexeur est déjà marqué, on conserve le tag.
  const alreadyTagged = !!idx.hasNoArrTag;
  return {
    shouldTag: alreadyTagged,
    keepExisting: true,
    reason: alreadyTagged
      ? 'Stats temporairement indisponibles : tag conservé par sécurité'
      : 'Ratio non configuré ou inconnu'
  };
}

/**
 * Synchronise les tags sur Prowlarr, Radarr et Sonarr.
 */
export async function syncAllTags(customEnriched = null, overrideConfig = null) {
  let config = getConfig();
  if (overrideConfig && typeof overrideConfig === 'object') {
    config = {
      ...config,
      taggingEnabled: overrideConfig.taggingEnabled !== undefined ? !!overrideConfig.taggingEnabled : config.taggingEnabled,
      taggingTag: overrideConfig.taggingTag ? String(overrideConfig.taggingTag).trim() : config.taggingTag,
      taggingRatioThreshold: overrideConfig.taggingRatioThreshold !== undefined
        ? (typeof overrideConfig.taggingRatioThreshold === 'number'
            ? overrideConfig.taggingRatioThreshold
            : parseFloat(overrideConfig.taggingRatioThreshold) || 1.0)
        : config.taggingRatioThreshold,
      taggingExcludeFreeleech: overrideConfig.taggingExcludeFreeleech !== undefined
        ? !!overrideConfig.taggingExcludeFreeleech
        : config.taggingExcludeFreeleech,
      radarrUrl: overrideConfig.radarrUrl !== undefined ? String(overrideConfig.radarrUrl).trim().replace(/\/+$/, '') : config.radarrUrl,
      radarrApiKey: overrideConfig.radarrApiKey !== undefined ? String(overrideConfig.radarrApiKey).trim() : config.radarrApiKey,
      sonarrUrl: overrideConfig.sonarrUrl !== undefined ? String(overrideConfig.sonarrUrl).trim().replace(/\/+$/, '') : config.sonarrUrl,
      sonarrApiKey: overrideConfig.sonarrApiKey !== undefined ? String(overrideConfig.sonarrApiKey).trim() : config.sonarrApiKey
    };
    try {
      saveConfig(config);
    } catch {}
  }

  if (!config.taggingEnabled) {
    return { ok: false, reason: 'Marquage par tag désactivé dans les paramètres' };
  }

  const tagLabel = String(config.taggingTag || 'no-arr').trim() || 'no-arr';
  const threshold = typeof config.taggingRatioThreshold === 'number'
    ? config.taggingRatioThreshold
    : parseFloat(config.taggingRatioThreshold) || 1.0;

  const enriched = customEnriched || (await getEnrichedIndexers({ force: true }));

  const report = {
    ok: true,
    tag: tagLabel,
    threshold,
    prowlarr: { tagged: 0, untagged: 0, total: 0, errors: [] },
    radarr: { configured: false, tagged: 0, untagged: 0, errors: [] },
    sonarr: { configured: false, tagged: 0, untagged: 0, errors: [] },
    details: []
  };

  // Map des décisions par nom d'indexeur normalisé et par ID
  const decisions = new Map();
  for (const idx of enriched) {
    const decision = shouldTagIndexer(idx, config);
    decisions.set(idx.id, { ...decision, indexer: idx });
    decisions.set(normalizeName(idx.name), { ...decision, indexer: idx });
    report.details.push({
      id: idx.id,
      name: idx.name,
      ratio: idx.tracker?.ratio ?? null,
      infinite: idx.tracker?.infinite ?? false,
      freeleech: idx.tracker?.freeleech ?? false,
      shouldTag: decision.shouldTag,
      reason: decision.reason
    });
  }

  // ── 1. Synchronisation Prowlarr ──
  if (config.prowlarrUrl && config.prowlarrApiKey) {
    try {
      const prowlarrTagId = await ensureTag(config.prowlarrUrl, config.prowlarrApiKey, tagLabel, 'v1');
      const prowlarrIndexers = await fetchIndexers(config.prowlarrUrl, config.prowlarrApiKey);
      report.prowlarr.total = prowlarrIndexers.length;

      for (const idx of prowlarrIndexers) {
        const dec = decisions.get(idx.id) || decisions.get(normalizeName(idx.name));
        const currentTags = Array.isArray(idx.tags) ? idx.tags : [];
        const hasTag = currentTags.includes(prowlarrTagId);

        let shouldTag = false;
        if (dec) {
          if (dec.keepExisting && hasTag) {
            shouldTag = true;
          } else {
            shouldTag = !!dec.shouldTag;
          }
        }

        if (shouldTag && !hasTag) {
          const newTags = [...currentTags, prowlarrTagId];
          await updateIndexerPriority(config.prowlarrUrl, config.prowlarrApiKey, {
            ...idx,
            tags: newTags
          });
          report.prowlarr.tagged += 1;
        } else if (!shouldTag && hasTag) {
          const newTags = currentTags.filter((t) => t !== prowlarrTagId);
          await updateIndexerPriority(config.prowlarrUrl, config.prowlarrApiKey, {
            ...idx,
            tags: newTags
          });
          report.prowlarr.untagged += 1;
        }
      }
    } catch (e) {
      report.prowlarr.errors.push(e.message);
    }
  }

  // Helper générique pour Radarr & Sonarr
  async function syncArrInstance(arrUrl, arrApiKey, targetKey, appName) {
    if (!arrUrl || !arrApiKey) return;
    report[targetKey].configured = true;

    try {
      const tagId = await ensureTag(arrUrl, arrApiKey, tagLabel, 'v3');
      const res = await fetch(`${arrUrl}/api/v3/indexer`, {
        headers: {
          'X-Api-Key': arrApiKey,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const arrIndexers = await res.json();

      for (const idx of arrIndexers) {
        const prowlarrId = extractProwlarrIdFromArrIndexer(idx);
        const norm = normalizeName(idx.name);
        const dec = (prowlarrId ? decisions.get(prowlarrId) : null) || decisions.get(norm);
        if (!dec) continue; // Pas géré par Sortarr / Prowlarr

        const currentTags = Array.isArray(idx.tags) ? idx.tags : [];
        const hasTag = currentTags.includes(tagId);

        let shouldTag = false;
        if (dec.keepExisting && hasTag) {
          shouldTag = true;
        } else {
          shouldTag = !!dec.shouldTag;
        }

        if (shouldTag && !hasTag) {
          const newTags = [...currentTags, tagId];
          const putRes = await fetch(`${arrUrl}/api/v3/indexer/${idx.id}`, {
            method: 'PUT',
            headers: {
              'X-Api-Key': arrApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ ...idx, tags: newTags }),
            signal: AbortSignal.timeout(20000)
          });
          if (!putRes.ok) {
            const err = await putRes.text();
            throw new Error(`Erreur mise à jour indexeur ${idx.name} dans ${appName}: ${err}`);
          }
          report[targetKey].tagged += 1;
        } else if (!shouldTag && hasTag) {
          const newTags = currentTags.filter((t) => t !== tagId);
          const putRes = await fetch(`${arrUrl}/api/v3/indexer/${idx.id}`, {
            method: 'PUT',
            headers: {
              'X-Api-Key': arrApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ ...idx, tags: newTags }),
            signal: AbortSignal.timeout(20000)
          });
          if (!putRes.ok) {
            const err = await putRes.text();
            throw new Error(`Erreur mise à jour indexeur ${idx.name} dans ${appName}: ${err}`);
          }
          report[targetKey].untagged += 1;
        }
      }
    } catch (e) {
      report[targetKey].errors.push(e.message);
    }
  }

  // ── 2. Synchronisation Radarr ──
  if (config.radarrUrl && config.radarrApiKey) {
    await syncArrInstance(config.radarrUrl, config.radarrApiKey, 'radarr', 'Radarr');
  }

  // ── 3. Synchronisation Sonarr ──
  if (config.sonarrUrl && config.sonarrApiKey) {
    await syncArrInstance(config.sonarrUrl, config.sonarrApiKey, 'sonarr', 'Sonarr');
  }

  return report;
}
