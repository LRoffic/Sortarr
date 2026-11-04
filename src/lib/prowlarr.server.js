/**
 * Prowlarr API client (server-side only)
 */

export async function fetchIndexers(prowlarrUrl, apiKey) {
  const url = `${prowlarrUrl}/api/v1/indexer`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey }
  });
  if (!res.ok) throw new Error(`Prowlarr API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchIndexerStats(prowlarrUrl, apiKey) {
  // Prowlarr indexerstats endpoint
  const url = `${prowlarrUrl}/api/v1/indexerstats`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': apiKey }
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTags(prowlarrUrl, apiKey) {
  const url = `${prowlarrUrl}/api/v1/tag`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function updateIndexerPriority(prowlarrUrl, apiKey, indexer) {
  const url = `${prowlarrUrl}/api/v1/indexer/${indexer.id}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(indexer)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update indexer ${indexer.id}: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function testConnection(prowlarrUrl, apiKey) {
  const url = `${prowlarrUrl}/api/v1/system/status`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey }
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
