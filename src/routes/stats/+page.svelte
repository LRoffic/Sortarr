<script>
  import { untrack } from 'svelte';
  import { getTrackerLogo, getTrackerInitials } from '$lib/logos.js';

  let { data } = $props();

  let trackers = $state(untrack(() => data.trackers ?? []));
  let datesDesc = $state(untrack(() => data.datesDesc ?? []));
  let selectedTrackerId = $state('all');
  let periodDays = $state(30); // 7, 14, 30, 90, 365
  let viewMode = $state('tracker'); // 'tracker' | 'daily' | 'matrix'
  let isRefreshing = $state(false);
  let statusMsg = $state(null);
  let failedLogos = $state({});

  function fmtBytes(b) {
    if (b === null || b === undefined || !Number.isFinite(b)) return '—';
    const sign = b < 0 ? '-' : '';
    const v = Math.abs(b);
    if (v === 0) return '0 o';
    if (v / 1024 ** 4 >= 1) return `${sign}${(v / 1024 ** 4).toFixed(2)} To`;
    if (v / 1024 ** 3 >= 1) return `${sign}${(v / 1024 ** 3).toFixed(2)} Go`;
    if (v / 1024 ** 2 >= 1) return `${sign}${(v / 1024 ** 2).toFixed(1)} Mo`;
    return `${sign}${Math.round(v / 1024)} Ko`;
  }

  function fmtDeltaBytes(b) {
    if (b === null || b === undefined || !Number.isFinite(b) || Math.abs(b) < 1024) return '0 o';
    const prefix = b > 0 ? '+' : '';
    return `${prefix}${fmtBytes(b)}`;
  }

  function fmtDeltaRatio(d) {
    if (d === null || d === undefined || !Number.isFinite(d) || Math.abs(d) < 0.0001) return '0.00';
    const prefix = d > 0 ? '+' : '';
    return `${prefix}${d.toFixed(2)}`;
  }

  function fmtDateFr(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function fmtShortDate(dateStr) {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  }

  function fmtTime(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  async function refreshSnapshot() {
    isRefreshing = true;
    statusMsg = null;
    try {
      const res = await fetch('/api/stats-history', { method: 'POST' });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error || 'Erreur lors de la mise à jour');
      trackers = r.trackers ?? [];
      datesDesc = r.datesDesc ?? [];
      statusMsg = { ok: true, text: 'Relevé quotidien mis à jour avec succès.' };
      setTimeout(() => (statusMsg = null), 4000);
    } catch (e) {
      statusMsg = { ok: false, text: e.message };
    } finally {
      isRefreshing = false;
    }
  }

  // Filtrage des trackers et des dates selon la période
  let filteredDatesDesc = $derived(datesDesc.slice(0, periodDays));
  let filteredDatesAsc = $derived([...filteredDatesDesc].reverse());

  let visibleTrackers = $derived(
    selectedTrackerId === 'all'
      ? trackers
      : trackers.filter((t) => String(t.id) === String(selectedTrackerId))
  );

  // Génère les coordonnées SVG pour la courbe d'évolution du ratio (ou de l'upload si ratio infini)
  function buildChartPoints(historyAsc) {
    const slice = historyAsc.slice(-periodDays);
    const pts = slice
      .map((d) => ({
        date: d.date,
        val: d.ratio !== null && Number.isFinite(d.ratio)
          ? d.ratio
          : d.uploaded !== null
          ? Number((d.uploaded / 1024 ** 3).toFixed(2))
          : null,
        isUploadFallback: d.ratio === null && d.uploaded !== null
      }))
      .filter((p) => p.val !== null);

    if (pts.length === 0) return { points: [], polyline: '', area: '', min: 0, max: 0, isUploadFallback: false };

    const W = 540;
    const H = 110;
    const padX = 24;
    const padY = 16;

    const vals = pts.map((p) => p.val);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min = Math.max(0, min - 0.5);
      max = max + 0.5;
    }

    const coords = pts.map((p, idx) => {
      const x = pts.length === 1 ? W / 2 : padX + (idx / (pts.length - 1)) * (W - padX * 2);
      const y = H - padY - ((p.val - min) / (max - min)) * (H - padY * 2);
      return { ...p, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const area =
      coords.length > 1
        ? `${coords[0].x},${H - padY} ${polyline} ${coords[coords.length - 1].x},${H - padY}`
        : '';

    return {
      points: coords,
      polyline,
      area,
      min,
      max,
      isUploadFallback: pts[0].isUploadFallback
    };
  }
</script>

<svelte:head>
  <title>Sortarr — Statistiques quotidiennes des ratios</title>
</svelte:head>

<div class="space-y-6">
  <!-- En-tête et barre d'outils -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold flex items-center gap-2">
        📈 Statistiques quotidiennes des ratios
      </h1>
      <p class="text-sm mt-1" style="color: var(--text-muted);">
        Suivi jour par jour du ratio, de l'upload, du download, du buffer et des points bonus pour chaque tracker torrent.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={refreshSnapshot}
        disabled={isRefreshing}
        class="px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
        style="background: var(--accent); color: white; opacity: {isRefreshing ? 0.6 : 1};"
      >
        {isRefreshing ? '⏳ Relevé en cours...' : '🔄 Capturer les stats du jour'}
      </button>
    </div>
  </div>

  {#if statusMsg}
    <div
      class="rounded-xl p-3.5 text-sm"
      style="background: {statusMsg.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {statusMsg.ok ? '#22c55e' : '#ef4444'}; color: {statusMsg.ok ? '#4ade80' : '#f87171'};"
    >
      {statusMsg.ok ? '✅' : '❌'} {statusMsg.text}
    </div>
  {/if}

  <!-- Filtres : Mode d'affichage, Tracker, Période -->
  <div
    class="rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
    style="background: var(--bg-secondary); border: 1px solid var(--border);"
  >
    <!-- Onglets de vue -->
    <div class="flex items-center gap-1.5 p-1 rounded-lg" style="background: var(--bg-primary);">
      <button
        type="button"
        onclick={() => (viewMode = 'tracker')}
        class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
        style="background: {viewMode === 'tracker' ? 'var(--accent)' : 'transparent'}; color: {viewMode === 'tracker' ? 'white' : 'var(--text-muted)'};"
      >
        📊 Par tracker
      </button>
      <button
        type="button"
        onclick={() => (viewMode = 'daily')}
        class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
        style="background: {viewMode === 'daily' ? 'var(--accent)' : 'transparent'}; color: {viewMode === 'daily' ? 'white' : 'var(--text-muted)'};"
      >
        📅 Journal par jour
      </button>
      <button
        type="button"
        onclick={() => (viewMode = 'matrix')}
        class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
        style="background: {viewMode === 'matrix' ? 'var(--accent)' : 'transparent'}; color: {viewMode === 'matrix' ? 'white' : 'var(--text-muted)'};"
      >
        🧮 Tableau comparatif
      </button>
    </div>

    <!-- Sélecteur de tracker + Période -->
    <div class="flex flex-wrap items-center gap-2.5 text-xs">
      <div class="flex items-center gap-1.5">
        <span style="color: var(--text-muted);">Tracker :</span>
        <select
          bind:value={selectedTrackerId}
          class="px-2.5 py-1.5 rounded-lg"
          style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
        >
          <option value="all">Tous les trackers ({trackers.length})</option>
          {#each trackers as tr (tr.id)}
            <option value={String(tr.id)}>{tr.name}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-1">
        {#each [7, 14, 30, 90, 365] as days}
          <button
            type="button"
            onclick={() => (periodDays = days)}
            class="px-2.5 py-1.5 rounded-lg font-medium cursor-pointer"
            style="background: {periodDays === days ? '#7c3aed33' : 'var(--bg-card)'}; border: 1px solid {periodDays === days ? '#7c3aed' : 'var(--border)'}; color: {periodDays === days ? '#c4b5fd' : 'var(--text-muted)'};"
          >
            {days === 365 ? '1 an' : `${days}j`}
          </button>
        {/each}
      </div>
    </div>
  </div>

  {#if trackers.length === 0}
    <div
      class="rounded-2xl p-10 text-center space-y-3"
      style="background: var(--bg-card); border: 1px solid var(--border);"
    >
      <div class="text-4xl">📉</div>
      <div class="text-lg font-semibold">Aucun historique de ratio enregistré pour le moment</div>
      <p class="text-sm max-w-md mx-auto" style="color: var(--text-muted);">
        Configurez vos trackers dans l'onglet <strong>Configuration</strong> puis cliquez sur
        <strong>Capturer les stats du jour</strong> pour démarrer l'enregistrement automatique quotidien.
      </p>
    </div>
  {:else if viewMode === 'tracker'}
    <!-- VUE 1 : CARTES DÉTAILLÉES PAR TRACKER -->
    <div class="space-y-5">
      {#each visibleTrackers as tr (tr.id)}
        {@const logoUrl = getTrackerLogo(tr)}
        {@const chart = buildChartPoints(tr.historyAsc)}
        {@const rowsDesc = tr.historyDesc.slice(0, periodDays)}
        <div
          class="rounded-2xl p-5 space-y-4"
          style="background: var(--bg-card); border: 1px solid var(--border);"
        >
          <!-- En-tête du tracker -->
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div
                class="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
                style="background: #0b0f19; border: 1px solid var(--border);"
              >
                {#if logoUrl && !failedLogos[tr.id]}
                  <img
                    src={logoUrl}
                    alt={tr.name}
                    class="w-8 h-8 object-contain"
                    onerror={() => {
                      failedLogos[tr.id] = true;
                    }}
                  />
                {:else}
                  <span class="text-xs font-extrabold" style="color: #a78bfa;">
                    {getTrackerInitials(tr.name)}
                  </span>
                {/if}
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-bold" style="color: #f8fafc;">{tr.name}</h2>
                  {#if tr.latest?.freeleech}
                    <span
                      class="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style="background: #422006; border: 1px solid #a16207; color: #facc15;"
                    >
                      FL ACTIF
                    </span>
                  {/if}
                </div>
                <div class="text-xs" style="color: var(--text-muted);">
                  {tr.historyAsc.length} jour{tr.historyAsc.length > 1 ? 's' : ''} enregistré{tr.historyAsc.length > 1 ? 's' : ''}
                  • Dernier relevé : {fmtDateFr(tr.latest?.date)} à {fmtTime(tr.latest?.updatedAt)}
                </div>
              </div>
            </div>

            <!-- KPIs actuels du jour -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
              <div class="px-3 py-1.5 rounded-lg" style="background: var(--bg-secondary);">
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                  Ratio actuel
                </div>
                <div class="text-base font-extrabold" style="color: #4ade80;">
                  {tr.latest?.infinite ? '∞' : (tr.latest?.ratio?.toFixed(2) ?? '—')}
                </div>
                {#if tr.latest?.deltaRatio}
                  <div
                    class="text-[11px] font-semibold"
                    style="color: {tr.latest.deltaRatio >= 0 ? '#4ade80' : '#f87171'};"
                  >
                    {fmtDeltaRatio(tr.latest.deltaRatio)} auj.
                  </div>
                {/if}
              </div>

              <div class="px-3 py-1.5 rounded-lg" style="background: var(--bg-secondary);">
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                  Upload
                </div>
                <div class="text-sm font-bold" style="color: #4ade80;">
                  {fmtBytes(tr.latest?.uploaded)}
                </div>
                <div
                  class="text-[11px]"
                  style="color: {(tr.latest?.deltaUploaded ?? 0) >= 0 ? '#86efac' : '#f87171'};"
                >
                  {fmtDeltaBytes(tr.latest?.deltaUploaded)} auj.
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg" style="background: var(--bg-secondary);">
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                  Download
                </div>
                <div class="text-sm font-bold" style="color: #cbd5e1;">
                  {fmtBytes(tr.latest?.downloaded)}
                </div>
                <div class="text-[11px]" style="color: #94a3b8;">
                  {fmtDeltaBytes(tr.latest?.deltaDownloaded)} auj.
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg" style="background: var(--bg-secondary);">
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                  Buffer
                </div>
                <div
                  class="text-sm font-bold"
                  style="color: {(tr.latest?.buffer ?? 0) < 0 ? '#f87171' : '#4ade80'};"
                >
                  {tr.latest?.infinite && tr.latest?.buffer === null ? '∞' : fmtBytes(tr.latest?.buffer)}
                </div>
                <div
                  class="text-[11px]"
                  style="color: {(tr.latest?.deltaBuffer ?? 0) >= 0 ? '#86efac' : '#f87171'};"
                >
                  {fmtDeltaBytes(tr.latest?.deltaBuffer)} auj.
                </div>
              </div>
            </div>
          </div>

          <!-- Courbe SVG d'évolution -->
          {#if chart.points.length > 0}
            <div
              class="rounded-xl p-3"
              style="background: var(--bg-secondary); border: 1px solid var(--border);"
            >
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="font-semibold" style="color: #cbd5e1;">
                  {chart.isUploadFallback ? 'Évolution Upload (Go)' : 'Évolution du Ratio'} ({chart.points.length} jour{chart.points.length > 1 ? 's' : ''})
                </span>
                <span style="color: var(--text-muted);">
                  Min : <strong>{chart.min.toFixed(2)}</strong> • Max : <strong>{chart.max.toFixed(2)}</strong>
                </span>
              </div>
              <svg viewBox="0 0 540 110" class="w-full h-28 overflow-visible">
                <defs>
                  <linearGradient id="grad-{tr.id}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.0" />
                  </linearGradient>
                </defs>
                {#if chart.area}
                  <polygon points={chart.area} fill="url(#grad-{tr.id})" />
                {/if}
                {#if chart.points.length > 1}
                  <polyline
                    fill="none"
                    stroke="#a78bfa"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    points={chart.polyline}
                  />
                {/if}
                {#each chart.points as pt}
                  <g>
                    <circle cx={pt.x} cy={pt.y} r="4" fill="#4ade80" stroke="#0f172a" stroke-width="1.5">
                      <title>{pt.date} : {pt.val}</title>
                    </circle>
                    {#if chart.points.length <= 14}
                      <text
                        x={pt.x}
                        y={pt.y - 8}
                        text-anchor="middle"
                        fill="#cbd5e1"
                        font-size="9"
                        font-family="monospace"
                      >
                        {pt.val.toFixed(2)}
                      </text>
                      <text
                        x={pt.x}
                        y="107"
                        text-anchor="middle"
                        fill="#64748b"
                        font-size="8.5"
                      >
                        {fmtShortDate(pt.date)}
                      </text>
                    {/if}
                  </g>
                {/each}
              </svg>
            </div>
          {/if}

          <!-- Tableau historique jour par jour pour ce tracker -->
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                  <th class="py-2 px-2.5 font-semibold">Date</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Ratio</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Ratio / j</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Upload</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Upload / j</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Download</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Download / j</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Buffer</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {#each rowsDesc as day (day.date)}
                  <tr
                    class="transition-colors hover:bg-white/[0.02]"
                    style="border-bottom: 1px solid #1e293b;"
                  >
                    <td class="py-2 px-2.5 font-medium whitespace-nowrap">
                      {fmtDateFr(day.date)}
                      {#if day.freeleech}
                        <span
                          class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style="background: #422006; color: #facc15;"
                        >
                          FL
                        </span>
                      {/if}
                    </td>
                    <td class="py-2 px-2.5 text-right font-mono font-bold" style="color: #4ade80;">
                      {day.infinite ? '∞' : (day.ratio?.toFixed(2) ?? '—')}
                    </td>
                    <td
                      class="py-2 px-2.5 text-right font-mono"
                      style="color: {(day.deltaRatio ?? 0) > 0 ? '#4ade80' : (day.deltaRatio ?? 0) < 0 ? '#f87171' : 'var(--text-muted)'};"
                    >
                      {fmtDeltaRatio(day.deltaRatio)}
                    </td>
                    <td class="py-2 px-2.5 text-right font-mono" style="color: #e2e8f0;">
                      {fmtBytes(day.uploaded)}
                    </td>
                    <td
                      class="py-2 px-2.5 text-right font-mono"
                      style="color: {(day.deltaUploaded ?? 0) > 0 ? '#4ade80' : 'var(--text-muted)'};"
                    >
                      {fmtDeltaBytes(day.deltaUploaded)}
                    </td>
                    <td class="py-2 px-2.5 text-right font-mono" style="color: #cbd5e1;">
                      {fmtBytes(day.downloaded)}
                    </td>
                    <td
                      class="py-2 px-2.5 text-right font-mono"
                      style="color: {(day.deltaDownloaded ?? 0) > 0 ? '#fb923c' : 'var(--text-muted)'};"
                    >
                      {fmtDeltaBytes(day.deltaDownloaded)}
                    </td>
                    <td
                      class="py-2 px-2.5 text-right font-mono font-semibold"
                      style="color: {(day.buffer ?? 0) < 0 ? '#f87171' : '#4ade80'};"
                    >
                      {day.infinite && day.buffer === null ? '∞' : fmtBytes(day.buffer)}
                    </td>
                    <td class="py-2 px-2.5 text-right font-mono" style="color: #f8fafc;">
                      {day.seedbonus !== null && day.seedbonus !== undefined
                        ? Math.round(day.seedbonus).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </div>
  {:else if viewMode === 'daily'}
    <!-- VUE 2 : JOURNAL QUOTIDIEN GROUPÉ PAR DATE -->
    <div class="space-y-5">
      {#each filteredDatesDesc as dateKey (dateKey)}
        <div
          class="rounded-2xl p-5 space-y-3"
          style="background: var(--bg-card); border: 1px solid var(--border);"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold capitalize" style="color: #f8fafc;">
              🗓️ {fmtDateFr(dateKey)}
            </h2>
            <span class="text-xs font-mono" style="color: var(--text-muted);">{dateKey}</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
                  <th class="py-2 px-2.5 font-semibold">Tracker</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Ratio</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Ratio</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Upload</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Upload</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Download</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Buffer</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {#each visibleTrackers as tr (tr.id)}
                  {@const day = tr.historyDesc.find((d) => d.date === dateKey)}
                  {@const logoUrl = getTrackerLogo(tr)}
                  {#if day}
                    <tr style="border-bottom: 1px solid #1e293b;">
                      <td class="py-2 px-2.5 font-semibold">
                        <div class="flex items-center gap-2">
                          <span
                            class="w-6 h-6 rounded-md flex items-center justify-center overflow-hidden shrink-0"
                            style="background: #0b0f19; border: 1px solid var(--border);"
                          >
                            {#if logoUrl && !failedLogos[tr.id]}
                              <img
                                src={logoUrl}
                                alt={tr.name}
                                class="w-4 h-4 object-contain"
                                onerror={() => {
                                  failedLogos[tr.id] = true;
                                }}
                              />
                            {:else}
                              <span class="text-[9px] font-bold" style="color: #a78bfa;">
                                {getTrackerInitials(tr.name)}
                              </span>
                            {/if}
                          </span>
                          <span>{tr.name}</span>
                        </div>
                      </td>
                      <td class="py-2 px-2.5 text-right font-mono font-bold" style="color: #4ade80;">
                        {day.infinite ? '∞' : (day.ratio?.toFixed(2) ?? '—')}
                      </td>
                      <td
                        class="py-2 px-2.5 text-right font-mono"
                        style="color: {(day.deltaRatio ?? 0) > 0 ? '#4ade80' : (day.deltaRatio ?? 0) < 0 ? '#f87171' : 'var(--text-muted)'};"
                      >
                        {fmtDeltaRatio(day.deltaRatio)}
                      </td>
                      <td class="py-2 px-2.5 text-right font-mono">{fmtBytes(day.uploaded)}</td>
                      <td
                        class="py-2 px-2.5 text-right font-mono"
                        style="color: {(day.deltaUploaded ?? 0) > 0 ? '#4ade80' : 'var(--text-muted)'};"
                      >
                        {fmtDeltaBytes(day.deltaUploaded)}
                      </td>
                      <td class="py-2 px-2.5 text-right font-mono">{fmtBytes(day.downloaded)}</td>
                      <td
                        class="py-2 px-2.5 text-right font-mono font-semibold"
                        style="color: {(day.buffer ?? 0) < 0 ? '#f87171' : '#4ade80'};"
                      >
                        {day.infinite && day.buffer === null ? '∞' : fmtBytes(day.buffer)}
                      </td>
                      <td class="py-2 px-2.5 text-right font-mono">
                        {day.seedbonus !== null && day.seedbonus !== undefined
                          ? Math.round(day.seedbonus).toLocaleString('fr-FR')
                          : '—'}
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- VUE 3 : MATRICE COMPARATIVE (JOURS × TRACKERS) -->
    <div
      class="rounded-2xl p-5 overflow-x-auto"
      style="background: var(--bg-card); border: 1px solid var(--border);"
    >
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted);">
            <th class="py-2.5 px-3 font-semibold">Date</th>
            {#each visibleTrackers as tr (tr.id)}
              <th class="py-2.5 px-3 font-semibold text-right whitespace-nowrap">{tr.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each filteredDatesDesc as dateKey (dateKey)}
            <tr style="border-bottom: 1px solid #1e293b;">
              <td class="py-2.5 px-3 font-medium whitespace-nowrap">{fmtDateFr(dateKey)}</td>
              {#each visibleTrackers as tr (tr.id)}
                {@const day = tr.historyDesc.find((d) => d.date === dateKey)}
                <td class="py-2.5 px-3 text-right font-mono">
                  {#if day}
                    <span class="font-bold" style="color: #4ade80;">
                      {day.infinite ? '∞' : (day.ratio?.toFixed(2) ?? '—')}
                    </span>
                    {#if day.deltaRatio && Math.abs(day.deltaRatio) >= 0.01}
                      <span
                        class="ml-1 text-[10px]"
                        style="color: {day.deltaRatio > 0 ? '#86efac' : '#f87171'};"
                      >
                        ({fmtDeltaRatio(day.deltaRatio)})
                      </span>
                    {/if}
                  {:else}
                    <span style="color: var(--text-muted);">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
