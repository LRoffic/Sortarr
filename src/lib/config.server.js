import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const defaultConfig = {
  prowlarrUrl: 'http://localhost:9696',
  prowlarrApiKey: '',
  autoRefreshInterval: 20,
  sortMode: 'manual',
  autoSortEnabled: false,
  autoSortInterval: 20,
  // URL du service api-ratio (https://github.com/kreezx/api-ratio), ex. http://localhost:8679
  apiRatioUrl: '',
  // { [indexerId]: { enabled, type: 'unit3d'|'manual', baseUrl, apiKey, freeleech: 'auto'|'on'|'off', manualUpGB, manualDownGB } }
  trackers: {}
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getConfig() {
  ensureDataDir();
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  try {
    return { ...defaultConfig, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(config) {
  ensureDataDir();
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...getConfig(), ...config }, null, 2));
}
