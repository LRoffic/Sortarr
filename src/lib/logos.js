/**
 * Retourne l'URL du logo correspondant à un indexeur Prowlarr.
 */
export function getTrackerLogo(indexerOrName) {
  const name = (typeof indexerOrName === 'string' ? indexerOrName : indexerOrName?.name || '').toLowerCase();

  if (name.includes('astra')) return '/logos/astra.png';
  if (name.includes('g3mini') || name.includes('gemini')) return '/logos/g3mini.png';
  if (name.includes('draupnirr')) return '/logos/draupnirr.ico';
  if (name.includes('tr4ker') || name.includes('tr4ck')) return '/logos/tr4ker.png';
  if (name.includes('c411')) return '/logos/c411.ico';
  if (name.includes('yggreborn') || name.includes('ygg reborn')) return '/logos/yggreborn.ico';
  if (name.includes('ygg')) return '/logos/yggtorrent.png';
  if (name.includes('crazy')) return '/logos/crazyspirits.png';
  if (name.includes('nostradamus')) return '/logos/nostradamus.png';
  if (name.includes('v3x')) return '/logos/v3x.ico';
  if (name.includes('torrent9') || name.includes('t9')) return '/logos/torrent9.svg';
  if (name.includes('old school') || name.includes('tos')) return '/logos/theoldschool.png';
  if (name.includes('generation') || name.includes('genfree')) return '/logos/generationfree.png';
  if (name.includes('speedapp')) return '/logos/speedapp.png';
  if (name.includes('teamflix')) return '/logos/teamflix.ico';

  // Fallback dynamique si l'indexeur possède une URL
  const rawUrl = typeof indexerOrName === 'object' ? (indexerOrName?.indexerUrls?.[0] || indexerOrName?.baseUrl || '') : '';
  if (rawUrl) {
    try {
      const host = new URL(rawUrl).hostname;
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('jackett')) {
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
      }
    } catch {}
  }

  return null;
}

export function getTrackerInitials(name) {
  const clean = String(name || '')
    .replace(/\(.*?\)/g, '')
    .trim();
  if (!clean) return '?';
  const words = clean.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}
