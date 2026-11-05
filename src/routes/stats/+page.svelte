<script>
  import { untrack } from 'svelte';
  import { getTrackerLogo, getTrackerInitials } from '$lib/logos.js';
  import { scrollAnimate } from '$lib/animate.js';
  import EvolutionChart from '$lib/EvolutionChart.svelte';
  import { getEffectivePaliers, formatPalierGB } from '$lib/paliers.js';

  let { data } = $props();

  function getTrPaliers(trackerId) {
    return getEffectivePaliers(trackerId, data?.statsPaliers, data?.trackerPaliersMap);
  }

  let trackers = $state(untrack(() => data.trackers ?? []));
  let datesDesc = $state(untrack(() => data.datesDesc ?? []));
  let selectedTrackerId = $state('all');
  let periodDays = $state(30); // 7, 14, 30, 90, 365
  let viewMode = $state('tracker'); // 'tracker' | 'daily' | 'matrix'
  let chartMetric = $state('ratio'); // 'ratio' | 'points'
  let isRefreshing = $state(false);
  let statusMsg = $state(null);
  let failedLogos = $state({});

  function fmtPoints(pts) {
    if (pts === null || pts === undefined || !Number.isFinite(pts)) return '—';
    if (Math.abs(pts) > 0 && Math.abs(pts) < 100 && pts % 1 !== 0) {
      return pts.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    return Math.round(pts).toLocaleString('fr-FR');
  }

  function fmtDeltaPoints(d) {
    if (d === null || d === undefined || !Number.isFinite(d) || Math.abs(d) < 0.01) return '0';
    const prefix = d > 0 ? '+' : '';
    if (Math.abs(d) < 100 && d % 1 !== 0) {
      return `${prefix}${d.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
    }
    return `${prefix}${Math.round(d).toLocaleString('fr-FR')}`;
  }

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

  let trackersWithPointsOrSeeds = $derived(
    visibleTrackers.filter(
      (tr) =>
        (tr.latest?.seedbonus !== null && tr.latest?.seedbonus !== undefined) ||
        (tr.latest?.astra !== null && tr.latest?.astra !== undefined) ||
        (tr.latest?.seeding !== null && tr.latest?.seeding !== undefined) ||
        (tr.latest?.extraBadges && tr.latest.extraBadges.length > 0)
    )
  );

  let totalSeeds = $derived(
    visibleTrackers.reduce((sum, tr) => sum + (Number.isFinite(tr.latest?.seeding) ? tr.latest.seeding : 0), 0)
  );

  // État local de la métrique affichée par tracker ('ratio' | 'points' | 'karma' | 'astra')
  let trackerMetric = $state({});

  function getMetric(trId) {
    return trackerMetric[trId] || 'ratio';
  }

  function setMetric(trId, m) {
    trackerMetric[trId] = m;
  }

  // Génère les coordonnées SVG pour la courbe d'évolution (Ratio/Upload, Karma, Astra ou Points)
  function buildChartPoints(historyAsc, metric = 'ratio', fallbackLabel = 'Points') {
    const slice = historyAsc.slice(-periodDays);
    const pts = slice
      .map((d) => {
        if (metric === 'astra') {
          const p = d.astra ?? d.flTokens;
          return {
            date: d.date,
            val: p !== null && p !== undefined && Number.isFinite(p) ? Number(p) : null,
            isUploadFallback: false,
            isPoints: true,
            unitLabel: 'Astra',
            metric
          };
        }
        if (metric === 'karma' || metric === 'points') {
          const p = metric === 'karma' ? (d.karma ?? d.seedbonus ?? d.points) : (d.seedbonus ?? d.points);
          return {
            date: d.date,
            val: p !== null && p !== undefined && Number.isFinite(p) ? Number(p) : null,
            isUploadFallback: false,
            isPoints: true,
            unitLabel: metric === 'karma' ? 'Karma' : (fallbackLabel || 'Points'),
            metric
          };
        }
        return {
          date: d.date,
          val:
            d.ratio !== null && Number.isFinite(d.ratio)
              ? d.ratio
              : d.uploaded !== null
                ? Number((d.uploaded / 1024 ** 3).toFixed(2))
                : null,
          isUploadFallback: d.ratio === null && d.uploaded !== null,
          isPoints: false,
          unitLabel: 'Ratio',
          metric: 'ratio'
        };
      })
      .filter((p) => p.val !== null);

    if (pts.length === 0)
      return { points: [], polyline: '', area: '', min: 0, max: 0, isUploadFallback: false, isPoints: metric !== 'ratio', metric };

    const W = 540;
    const H = 110;
    const padX = 24;
    const padY = 16;

    const vals = pts.map((p) => p.val);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const range = max - min;
    if (range === 0) {
      min = Math.max(0, min - 0.5);
      max = max + 0.5;
    } else if (range < 0.2) {
      min = Math.max(0, min - (0.2 - range) / 2);
      max = max + (0.2 - range) / 2;
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
      isUploadFallback: pts[0]?.isUploadFallback ?? false,
      isPoints: metric !== 'ratio',
      metric
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
        📈 Statistiques quotidiennes des ratios & points
      </h1>
      <p class="text-sm mt-1" style="color: var(--text-muted);">
        Suivi jour par jour du ratio, de l'upload, du download, du buffer, des points/jetons/karma/zen et des seeds pour chaque tracker.
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

  <!-- Bandeau récapitulatif des Points / Jetons / Karma / Zen / Crédits & Seeds -->
  {#if trackersWithPointsOrSeeds.length > 0}
    <div
      use:scrollAnimate
      class="stat-scroll-trigger rounded-2xl p-4 space-y-3"
      style="background: linear-gradient(135deg, #1e1b4b55 0%, var(--bg-card) 100%); border: 1px solid #4c1d9588;"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style="color: #c4b5fd;">
          <span>🪙 Points, Jetons, Karma, Zen, Crédits & Seeds — État & variation du jour</span>
        </div>
        {#if totalSeeds > 0}
          <span
            class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full"
            style="background: #052e16; border: 1px solid #166534; color: #4ade80;"
          >
            🌱 {totalSeeds.toLocaleString('fr-FR')} torrents en seed au total
          </span>
        {/if}
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        {#each trackersWithPointsOrSeeds as tr (tr.id)}
          {@const logoUrl = getTrackerLogo(tr)}
          {@const pts = tr.points ?? tr.latest?.points ?? tr.latest?.seedbonus ?? null}
          {@const label = tr.pointsLabel || tr.latest?.pointsLabel || 'POINTS'}
          {@const isAstra = tr.name?.toLowerCase().includes('astra') || tr.definitionName?.toLowerCase().includes('astra') || label === 'KARMA'}
          {@const astraVal = tr.astra ?? tr.latest?.astra ?? (isAstra ? (tr.flTokens ?? tr.latest?.flTokens) : null)}
          {@const pph = tr.pointsPerHour ?? tr.latest?.pointsPerHour ?? null}
          {@const deltaPts = tr.latest?.deltaSeedbonus ?? null}
          {@const seeds = tr.seeding ?? tr.latest?.seeding ?? null}
          {@const badges = tr.extraBadges?.length ? tr.extraBadges : (tr.latest?.extraBadges || [])}
          <div
            class="rounded-xl p-2.5 flex flex-col justify-between gap-1.5"
            style="background: var(--bg-secondary); border: 1px solid var(--border);"
          >
            <div class="flex items-center justify-between gap-1.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  class="w-5 h-5 rounded flex items-center justify-center overflow-hidden shrink-0"
                  style="background: #0b0f19; border: 1px solid var(--border);"
                >
                  {#if logoUrl && !failedLogos[tr.id]}
                    <img
                      src={logoUrl}
                      alt={tr.name}
                      class="w-3.5 h-3.5 object-contain"
                      onerror={() => {
                        failedLogos[tr.id] = true;
                      }}
                    />
                  {:else}
                    <span class="text-[8px] font-bold" style="color: #a78bfa;">
                      {getTrackerInitials(tr.name)}
                    </span>
                  {/if}
                </span>
                <span class="text-xs font-bold truncate" style="color: #f8fafc;">{tr.name}</span>
              </div>
              <span
                class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shrink-0"
                style="background: #2e1065; color: #ddd6fe; border: 1px solid #5b21b6;"
              >
                {label}
              </span>
            </div>

            <div class="flex items-baseline justify-between gap-2">
              <div class="text-base font-extrabold font-mono" style="color: #facc15;">
                {pts !== null && pts !== undefined ? fmtPoints(pts) : '—'}
              </div>
              <div class="text-right text-[10px] font-mono">
                {#if deltaPts !== null && deltaPts !== undefined && deltaPts !== 0}
                  <span
                    class="font-bold"
                    style="color: {deltaPts > 0 ? '#4ade80' : '#f87171'};"
                    title="Variation des points sur la journée"
                  >
                    {fmtDeltaPoints(deltaPts)} auj.
                  </span>
                {:else if pph !== null && pph !== undefined}
                  <span style="color: #a78bfa;">+{Number(pph).toFixed(1)}/h</span>
                {/if}
              </div>
            </div>

            {#if isAstra && astraVal !== null && astraVal !== undefined}
              <div class="flex items-baseline justify-between gap-1 text-[11px] font-mono" style="color: #c084fc;">
                <span>🪙 {fmtPoints(astraVal)} Astra</span>
                {#if tr.latest?.deltaAstra}
                  <span style="color: {tr.latest.deltaAstra > 0 ? '#4ade80' : '#f87171'};">
                    {fmtDeltaPoints(tr.latest.deltaAstra)}
                  </span>
                {/if}
              </div>
            {/if}

            <!-- Petite barre animée de progression des points/monnaie -->
            <div
              class="h-1 w-full rounded-full overflow-hidden my-0.5 cursor-help"
              style="background: rgba(255,255,255,0.06);"
              data-tooltip={`${isAstra ? 'Karma' : label} : ${fmtPoints(pts)} / 25 000 (${Math.min(100, Math.round(((pts ?? 0) / 25000) * 100))}% du palier)`}
            >
              <div
                class="h-full rounded-full stat-bar-grow-x"
                style="width: {Math.min(100, Math.max(12, ((pts ?? 0) / 25000) * 100))}%; background: {isAstra ? 'linear-gradient(90deg, #facc15, #c084fc)' : '#facc15'};"
              ></div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-1 pt-1" style="border-top: 1px solid #1e293b;">
              <div class="flex flex-wrap items-center gap-1">
                {#if pph !== null && pph !== undefined && deltaPts !== null && deltaPts !== 0}
                  <span class="text-[9px] font-mono" style="color: #a78bfa;">+{Number(pph).toFixed(1)}/h</span>
                {/if}
                {#each badges as b}
                  <span
                    class="text-[9px] font-semibold px-1.5 py-0.2 rounded"
                    style="background: #1e293b; color: #cbd5e1;"
                  >
                    {b}
                  </span>
                {/each}
              </div>
              {#if seeds !== null && seeds !== undefined}
                <span class="text-[10px] font-mono font-semibold" style="color: #4ade80;" title="Torrents en seed">
                  🌱 {Number(seeds).toLocaleString('fr-FR')}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Filtres : Mode d'affichage, Métrique courbe, Tracker, Période -->
  <div
    class="rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
    style="background: var(--bg-secondary); border: 1px solid var(--border);"
  >
    <!-- Onglets de vue -->
    <div class="flex flex-wrap items-center gap-2">
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

      <!-- Sélecteur de métrique pour le tableau comparatif -->
      {#if viewMode === 'matrix'}
        <div class="flex items-center gap-1 p-1 rounded-lg" style="background: var(--bg-primary);">
          <button
            type="button"
            onclick={() => (chartMetric = 'ratio')}
            class="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer"
            style="background: {chartMetric === 'ratio' ? '#166534' : 'transparent'}; color: {chartMetric === 'ratio' ? '#4ade80' : 'var(--text-muted)'};"
          >
            📈 Ratio
          </button>
          <button
            type="button"
            onclick={() => (chartMetric = 'points')}
            class="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer"
            style="background: {chartMetric === 'points' ? '#713f12' : 'transparent'}; color: {chartMetric === 'points' ? '#facc15' : 'var(--text-muted)'};"
          >
            🪙 Points / Jetons
          </button>
        </div>
      {/if}
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
        {@const ptsLabel = tr.pointsLabel || tr.latest?.pointsLabel || 'Points'}
        {@const isAstra = tr.name?.toLowerCase().includes('astra') || tr.definitionName?.toLowerCase().includes('astra') || ptsLabel === 'KARMA'}
        {@const currentPts = tr.points ?? tr.latest?.points ?? tr.latest?.seedbonus ?? null}
        {@const currentAstra = tr.astra ?? tr.latest?.astra ?? (isAstra ? (tr.flTokens ?? tr.latest?.flTokens) : null) ?? null}
        {@const currentPph = tr.pointsPerHour ?? tr.latest?.pointsPerHour ?? null}
        {@const currentSeeds = tr.seeding ?? tr.latest?.seeding ?? null}
        {@const badges = tr.extraBadges?.length ? tr.extraBadges : (tr.latest?.extraBadges || [])}
        {@const hasCurrency = (currentPts !== null && currentPts !== undefined) || (currentAstra !== null && currentAstra !== undefined) || isAstra}
        {@const activeMetric = getMetric(tr.id)}
        {@const chart = buildChartPoints(tr.historyAsc, activeMetric, ptsLabel)}
        {@const rowsDesc = tr.historyDesc.slice(0, periodDays)}
        {@const pal = getTrPaliers(tr.id)}
        <div
          use:scrollAnimate
          class="stat-scroll-trigger rounded-2xl p-5 space-y-4"
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
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-lg font-bold" style="color: #f8fafc;">{tr.name}</h2>
                  {#if tr.latest?.freeleech}
                    <span
                      class="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style="background: #422006; border: 1px solid #a16207; color: #facc15;"
                    >
                      FL ACTIF
                    </span>
                  {/if}
                  {#each badges as badge}
                    <span
                      class="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                      style="background: #1e1b4b; border: 1px solid #4c1d95; color: #ddd6fe;"
                    >
                      {badge}
                    </span>
                  {/each}
                </div>
                <div class="text-xs" style="color: var(--text-muted);">
                  {tr.historyAsc.length} jour{tr.historyAsc.length > 1 ? 's' : ''} enregistré{tr.historyAsc.length > 1 ? 's' : ''}
                  • Dernier relevé : {fmtDateFr(tr.latest?.date)} à {fmtTime(tr.latest?.updatedAt)}
                </div>
              </div>
            </div>

            <!-- Bouton ratio/point en haut à droite du tracker (affiché uniquement si le tracker dispose d'une monnaie) -->
            {#if hasCurrency}
              <div
                class="flex items-center gap-1 p-1 rounded-xl shrink-0"
                style="background: var(--bg-secondary); border: 1px solid var(--border);"
              >
                <button
                  type="button"
                  onclick={() => setMetric(tr.id, 'ratio')}
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  style="background: {activeMetric === 'ratio' ? '#166534' : 'transparent'}; color: {activeMetric === 'ratio' ? '#4ade80' : 'var(--text-muted)'};"
                >
                  📈 Ratio
                </button>
                {#if isAstra}
                  <button
                    type="button"
                    onclick={() => setMetric(tr.id, 'karma')}
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    style="background: {activeMetric === 'karma' ? '#713f12' : 'transparent'}; color: {activeMetric === 'karma' ? '#facc15' : 'var(--text-muted)'};"
                  >
                    ✨ Karma
                  </button>
                  <button
                    type="button"
                    onclick={() => setMetric(tr.id, 'astra')}
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    style="background: {activeMetric === 'astra' ? '#581c87' : 'transparent'}; color: {activeMetric === 'astra' ? '#c084fc' : 'var(--text-muted)'};"
                  >
                    🪙 Astra
                  </button>
                {:else}
                  <button
                    type="button"
                    onclick={() => setMetric(tr.id, 'points')}
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    style="background: {activeMetric === 'points' ? '#713f12' : 'transparent'}; color: {activeMetric === 'points' ? '#facc15' : 'var(--text-muted)'};"
                  >
                    🪙 {ptsLabel}
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- KPIs actuels du jour (Ratio, Upload, Download, Buffer, Points/Karma, Astra, Seeds) -->
          <div class="grid grid-cols-2 sm:grid-cols-3 {isAstra ? 'lg:grid-cols-7' : 'lg:grid-cols-6'} gap-2.5 text-right">
              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary);">
                <div>
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
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #1e293b;"
                  data-tooltip={tr.latest?.infinite ? 'Ratio actuel : ∞ (Illimité)' : `Ratio actuel : ${(tr.latest?.ratio ?? 0).toFixed(2)} / ${pal.ratio.toFixed(1)} (${Math.min(100, Math.round(((tr.latest?.ratio ?? 0) / pal.ratio) * 100))}% de l'objectif)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {tr.latest?.infinite ? 100 : Math.min(100, Math.max(12, ((tr.latest?.ratio ?? 0) / pal.ratio) * 100))}%; background: #4ade80;"></div>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary);">
                <div>
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
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #1e293b;"
                  data-tooltip={`Upload : ${fmtBytes(tr.latest?.uploaded)} / ${formatPalierGB(pal.uploadGB)} (${Math.min(100, Math.round(((tr.latest?.uploaded ?? 0) / (pal.uploadGB * 1024 ** 3)) * 100))}% du palier)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {Math.min(100, Math.max(12, ((tr.latest?.uploaded ?? 0) / (pal.uploadGB * 1024 ** 3)) * 100))}%; background: #4ade80;"></div>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary);">
                <div>
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
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #1e293b;"
                  data-tooltip={`Download : ${fmtBytes(tr.latest?.downloaded)} / ${formatPalierGB(pal.downloadGB)} (${Math.min(100, Math.round(((tr.latest?.downloaded ?? 0) / (pal.downloadGB * 1024 ** 3)) * 100))}% du palier)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {Math.min(100, Math.max(12, ((tr.latest?.downloaded ?? 0) / (pal.downloadGB * 1024 ** 3)) * 100))}%; background: #94a3b8;"></div>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary);">
                <div>
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
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #1e293b;"
                  data-tooltip={tr.latest?.infinite && tr.latest?.buffer === null ? 'Buffer : ∞ (Illimité)' : `Buffer : ${fmtBytes(tr.latest?.buffer)} / ${formatPalierGB(pal.bufferGB)} (${Math.min(100, Math.round((Math.abs(tr.latest?.buffer ?? 0) / (pal.bufferGB * 1024 ** 3)) * 100))}% du palier)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {tr.latest?.infinite ? 100 : Math.min(100, Math.max(12, (Math.abs(tr.latest?.buffer ?? 0) / (pal.bufferGB * 1024 ** 3)) * 100))}%; background: {(tr.latest?.buffer ?? 0) < 0 ? '#f87171' : '#4ade80'};"></div>
                </div>
              </div>

              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary); border: 1px solid #42200688;">
                <div>
                  <div class="text-[10px] uppercase tracking-wider font-bold" style="color: #facc15;">
                    {isAstra ? '✨ Karma' : `🪙 ${ptsLabel}`}
                  </div>
                  <div class="text-sm font-extrabold font-mono" style="color: #fef08a;">
                    {currentPts !== null && currentPts !== undefined ? fmtPoints(currentPts) : '—'}
                  </div>
                  <div class="text-[11px] font-mono">
                    {#if tr.latest?.deltaSeedbonus !== null && tr.latest?.deltaSeedbonus !== undefined && tr.latest?.deltaSeedbonus !== 0}
                      <span style="color: {tr.latest.deltaSeedbonus > 0 ? '#4ade80' : '#f87171'};">
                        {fmtDeltaPoints(tr.latest.deltaSeedbonus)} auj.
                      </span>
                    {:else if currentPph !== null && currentPph !== undefined}
                      <span style="color: #c4b5fd;">+{Number(currentPph).toFixed(1)}/h</span>
                    {:else}
                      <span style="color: var(--text-muted);">—</span>
                    {/if}
                  </div>
                </div>
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #42200644;"
                  data-tooltip={`${isAstra ? 'Karma' : ptsLabel} : ${fmtPoints(currentPts)} / ${pal.points.toLocaleString('fr-FR')} (${Math.min(100, Math.round(((currentPts ?? 0) / pal.points) * 100))}% du palier)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {Math.min(100, Math.max(12, ((currentPts ?? 0) / pal.points) * 100))}%; background: #facc15;"></div>
                </div>
              </div>

              {#if isAstra}
                <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary); border: 1px solid #581c8766;">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider font-bold" style="color: #c084fc;">
                      🪙 Astra
                    </div>
                    <div class="text-sm font-extrabold font-mono" style="color: #e9d5ff;">
                      {currentAstra !== null && currentAstra !== undefined ? fmtPoints(currentAstra) : '—'}
                    </div>
                    <div class="text-[11px] font-mono">
                      {#if tr.latest?.deltaAstra !== null && tr.latest?.deltaAstra !== undefined && tr.latest?.deltaAstra !== 0}
                        <span style="color: {tr.latest.deltaAstra > 0 ? '#4ade80' : '#f87171'};">
                          {fmtDeltaPoints(tr.latest.deltaAstra)} auj.
                        </span>
                      {:else}
                        <span style="color: var(--text-muted);">monnaie site</span>
                      {/if}
                    </div>
                  </div>
                  <div
                    class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                    style="background: #581c8744;"
                    data-tooltip={`Astra : ${currentAstra !== null && currentAstra !== undefined ? fmtPoints(currentAstra) : 0} / ${pal.astra.toLocaleString('fr-FR')} (${Math.min(100, Math.round(((currentAstra ?? 0) / pal.astra) * 100))}% du palier)`}
                  >
                    <div class="h-full rounded-full stat-bar-grow-x" style="width: {Math.min(100, Math.max(12, ((currentAstra ?? 0) / pal.astra) * 100))}%; background: #c084fc;"></div>
                  </div>
                </div>
              {/if}

              <div class="px-3 py-1.5 rounded-lg flex flex-col justify-between" style="background: var(--bg-secondary);">
                <div>
                  <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                    🌱 Seeds
                  </div>
                  <div class="text-sm font-bold font-mono" style="color: #4ade80;">
                    {currentSeeds !== null && currentSeeds !== undefined ? Number(currentSeeds).toLocaleString('fr-FR') : '—'}
                  </div>
                  <div class="text-[11px]" style="color: var(--text-muted);">
                    {#if currentPph !== null && currentPph !== undefined}
                      +{Number(currentPph).toFixed(1)} pts/h
                    {:else}
                      actifs
                    {/if}
                  </div>
                </div>
                <div
                  class="h-1 w-full rounded-full overflow-hidden mt-1.5 cursor-help"
                  style="background: #1e293b;"
                  data-tooltip={`Seeds : ${currentSeeds ?? 0} / ${pal.seeds.toLocaleString('fr-FR')} (${Math.min(100, Math.round(((currentSeeds ?? 0) / pal.seeds) * 100))}% de l'objectif)`}
                >
                  <div class="h-full rounded-full stat-bar-grow-x" style="width: {Math.min(100, Math.max(12, ((currentSeeds ?? 0) / pal.seeds) * 100))}%; background: #4ade80;"></div>
                </div>
              </div>
            </div>

          <!-- Courbe SVG d'évolution (Anime depuis 0.0 vers les valeurs au scroll) -->
          {#if chart.points.length > 0}
            <EvolutionChart
              {chart}
              trackerId={tr.id}
              {activeMetric}
              {ptsLabel}
              {isAstra}
            />
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
                  <th class="py-2 px-2.5 font-semibold text-right" style="color: #facc15;">
                    {isAstra ? '✨ Karma' : `🪙 ${ptsLabel}`}
                  </th>
                  <th class="py-2 px-2.5 font-semibold text-right">
                    Δ {isAstra ? 'Karma' : ptsLabel} / j
                  </th>
                  {#if isAstra}
                    <th class="py-2 px-2.5 font-semibold text-right" style="color: #c084fc;">
                      🪙 Astra
                    </th>
                    <th class="py-2 px-2.5 font-semibold text-right">
                      Δ Astra / j
                    </th>
                  {/if}
                  <th class="py-2 px-2.5 font-semibold text-right">🌱 Seeds</th>
                </tr>
              </thead>
              <tbody>
                {#each rowsDesc as day (day.date)}
                  {@const dayPts = day.points ?? day.seedbonus ?? null}
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
                    <td class="py-2 px-2.5 text-right font-mono font-bold" style="color: #fef08a;">
                      {dayPts !== null && dayPts !== undefined ? fmtPoints(dayPts) : '—'}
                    </td>
                    <td
                      class="py-2 px-2.5 text-right font-mono"
                      style="color: {(day.deltaSeedbonus ?? 0) > 0 ? '#4ade80' : (day.deltaSeedbonus ?? 0) < 0 ? '#f87171' : 'var(--text-muted)'};"
                    >
                      {fmtDeltaPoints(day.deltaSeedbonus)}
                    </td>
                    {#if isAstra}
                      <td class="py-2 px-2.5 text-right font-mono font-bold" style="color: #e9d5ff;">
                        {day.astra !== null && day.astra !== undefined ? fmtPoints(day.astra) : (currentAstra !== null ? fmtPoints(currentAstra) : '—')}
                      </td>
                      <td
                        class="py-2 px-2.5 text-right font-mono"
                        style="color: {(day.deltaAstra ?? 0) > 0 ? '#4ade80' : (day.deltaAstra ?? 0) < 0 ? '#f87171' : 'var(--text-muted)'};"
                      >
                        {fmtDeltaPoints(day.deltaAstra)}
                      </td>
                    {/if}
                    <td class="py-2 px-2.5 text-right font-mono" style="color: #86efac;">
                      {day.seeding !== null && day.seeding !== undefined
                        ? `🌱 ${Number(day.seeding).toLocaleString('fr-FR')}`
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
                  <th class="py-2 px-2.5 font-semibold text-right" style="color: #facc15;">🪙 Points / Jetons</th>
                  <th class="py-2 px-2.5 font-semibold text-right">Δ Points</th>
                  <th class="py-2 px-2.5 font-semibold text-right">🌱 Seeds</th>
                </tr>
              </thead>
              <tbody>
                {#each visibleTrackers as tr (tr.id)}
                  {@const day = tr.historyDesc.find((d) => d.date === dateKey)}
                  {@const logoUrl = getTrackerLogo(tr)}
                  {#if day}
                    {@const dayPts = day.points ?? day.seedbonus ?? null}
                    {@const unitLabel = day.pointsLabel || tr.pointsLabel || 'PTS'}
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
                        {#if dayPts !== null && dayPts !== undefined}
                          <span class="font-bold" style="color: #fef08a;">{fmtPoints(dayPts)}</span>
                          <span
                            class="ml-1 text-[9px] font-bold px-1 py-0.5 rounded"
                            style="background: #2e1065; color: #ddd6fe;"
                          >
                            {unitLabel}
                          </span>
                        {:else}
                          <span style="color: var(--text-muted);">—</span>
                        {/if}
                      </td>
                      <td
                        class="py-2 px-2.5 text-right font-mono"
                        style="color: {(day.deltaSeedbonus ?? 0) > 0 ? '#4ade80' : (day.deltaSeedbonus ?? 0) < 0 ? '#f87171' : 'var(--text-muted)'};"
                      >
                        {fmtDeltaPoints(day.deltaSeedbonus)}
                      </td>
                      <td class="py-2 px-2.5 text-right font-mono" style="color: #86efac;">
                        {day.seeding !== null && day.seeding !== undefined
                          ? `🌱 ${Number(day.seeding).toLocaleString('fr-FR')}`
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
              <th class="py-2.5 px-3 font-semibold text-right whitespace-nowrap">
                <div>{tr.name}</div>
                {#if chartMetric === 'points'}
                  <div class="text-[9px] font-normal" style="color: #facc15;">
                    {tr.pointsLabel || 'Points'}
                  </div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each filteredDatesDesc as dateKey (dateKey)}
            <tr style="border-bottom: 1px solid #1e293b;">
              <td class="py-2.5 px-3 font-medium whitespace-nowrap">{fmtDateFr(dateKey)}</td>
              {#each visibleTrackers as tr (tr.id)}
                {@const day = tr.historyDesc.find((d) => d.date === dateKey)}
                {@const dayPts = day ? (day.points ?? day.seedbonus ?? null) : null}
                <td class="py-2.5 px-3 text-right font-mono">
                  {#if day}
                    {#if chartMetric === 'points'}
                      {#if dayPts !== null && dayPts !== undefined}
                        <span class="font-bold" style="color: #fef08a;">
                          {fmtPoints(dayPts)}
                        </span>
                        {#if day.deltaSeedbonus && day.deltaSeedbonus !== 0}
                          <span
                            class="ml-1 text-[10px]"
                            style="color: {day.deltaSeedbonus > 0 ? '#4ade80' : '#f87171'};"
                          >
                            ({fmtDeltaPoints(day.deltaSeedbonus)})
                          </span>
                        {/if}
                      {:else}
                        <span style="color: var(--text-muted);">—</span>
                      {/if}
                    {:else}
                      <div>
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
                      </div>
                      {#if dayPts !== null && dayPts !== undefined}
                        <div class="text-[10px]" style="color: #facc15;">
                          🪙 {fmtPoints(dayPts)}
                        </div>
                      {/if}
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
