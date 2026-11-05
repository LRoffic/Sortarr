import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const defaultConfig = {
  // Identifiant unique anonyme d'instance (UUID v4)
  instanceId: '',
  // Télémétrie anonyme
  telemetryEnabled: true,
  prowlarrUrl: 'http://localhost:9696',
  prowlarrApiKey: '',
  autoRefreshInterval: 20,
  sortMode: 'manual',
  autoSortEnabled: false,
  autoSortInterval: 20,
  // URL du service api-ratio (https://github.com/kreezx/api-ratio), ex. http://localhost:8679
  apiRatioUrl: '',
  // Marquage automatique par tag selon le ratio (Radarr / Sonarr / cross-seed)
  taggingEnabled: false,
  taggingTag: 'no-arr',
  taggingRatioThreshold: 1.0,
  taggingExcludeFreeleech: true,
  radarrUrl: '',
  radarrApiKey: '',
  sonarrUrl: '',
  sonarrApiKey: '',
  // Paliers d'objectifs pour les jauges de statistiques (global vs par tracker)
  statsPaliers: {
    mode: 'global', // 'global' | 'tracker'
    global: {
      ratio: 4.0,
      uploadGB: 2048,
      downloadGB: 2048,
      bufferGB: 1024,
      points: 25000,
      astra: 1000,
      seeds: 150
    }
  },
  // { [indexerId]: { enabled, type: 'unit3d'|'manual', baseUrl, apiKey, freeleech: 'auto'|'on'|'off', manualUpGB, manualDownGB, paliers: {} } }
  trackers: {}
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getConfig() {
  ensureDataDir();
  let cfg;
  if (!existsSync(CONFIG_FILE)) {
    cfg = { ...defaultConfig, instanceId: crypto.randomUUID() };
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return cfg;
  }
  try {
    cfg = { ...defaultConfig, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    cfg = { ...defaultConfig };
  }

  // Génère et sauvegarde aléatoirement un instanceId unique si inexistant
  if (!cfg.instanceId || typeof cfg.instanceId !== 'string') {
    cfg.instanceId = cfg.instance_id || crypto.randomUUID();
    try {
      writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    } catch {}
  }

  return cfg;
}

export function saveConfig(config) {
  ensureDataDir();
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...getConfig(), ...config }, null, 2));
}
