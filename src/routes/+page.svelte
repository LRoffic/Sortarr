<script>
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { onMount, onDestroy } from 'svelte';
  import { sortIndexers } from '$lib/sorting.js';
  import { getTrackerLogo, getTrackerInitials } from '$lib/logos.js';

  let { data } = $props();
  let failedLogos = $state({});

  let indexers = $state([]);
  let isSaving = $state(false);
  let saveResult = $state(null);
  let isRefreshing = $state(false);
  let lastRefresh = $state(new Date());
  let schedulerStatus = $state(null);
  let schedulerPollTimer = null;
  let showHelpModal = $state(false);

  // Enrich indexers with stats
  function enrichIndexers(rawIndexers) {
    return rawIndexers.map((idx) => ({ ...idx, _hasFreeleech: idx.tracker?.freeleech === true }));
  }

  async function fetchSchedulerStatus() {
    try {
      const res = await fetch('/api/scheduler-status');
      if (res.ok) schedulerStatus = await res.json();
    } catch { /* silent */ }
  }

  onMount(() => {
    indexers = enrichIndexers(data.indexers, data.stats);
    fetchSchedulerStatus();
    schedulerPollTimer = setInterval(fetchSchedulerStatus, 30000);
  });

  onDestroy(() => {
    if (schedulerPollTimer) clearInterval(schedulerPollTimer);
  });

  function handleDndConsider(e) {
    indexers = e.detail.items;
  }
  
  function handleDndFinalize(e) {
    indexers = e.detail.items;
  }

  function autoSort() {
    // Freeleech d'abord (moins de buffer en tête), puis buffer décroissant
    indexers = sortIndexers(indexers);
  }

  function resetOrder() {
    indexers = enrichIndexers([...data.indexers], data.stats);
  }

  async function applyPriorities() {
    isSaving = true;
    saveResult = null;
    try {
      const payload = indexers.map((idx, i) => ({
        id: idx.id,
        priority: i + 1
      }));
      const res = await fetch('/api/apply-priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities: payload })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Erreur serveur');
      saveResult = { ok: true, message: `✅ ${result.updated} indexeur(s) mis à jour avec succès` };
    } catch (e) {
      saveResult = { ok: false, message: `❌ ${e.message}` };
    } finally {
      isSaving = false;
    }
  }

  async function triggerAutoSort() {
    saveResult = { ok: null, message: '⏳ Auto-tri en cours...' };
    try {
      const res = await fetch('/api/run-autosort', { method: 'POST' });
      const result = await res.json();
      if (result.ok) {
        saveResult = { ok: true, message: `✅ Auto-tri appliqué — ${result.updated} indexeur(s) mis à jour` };
      } else {
        saveResult = { ok: false, message: `⚠️ Auto-tri terminé avec erreurs: ${result.errors?.join(', ')}` };
      }
      await fetchSchedulerStatus();
      await refresh();
    } catch (e) {
      saveResult = { ok: false, message: `❌ ${e.message}` };
    }
  }

  async function refresh() {
    isRefreshing = true;
    try {
      const res = await fetch('/api/indexers?force=1');
      const result = await res.json();
      if (res.ok) {
        indexers = enrichIndexers(result.indexers, result.stats);
        lastRefresh = new Date();
        saveResult = null;
      }
    } catch (e) {
      saveResult = { ok: false, message: `❌ Erreur de rafraîchissement: ${e.message}` };
    } finally {
      isRefreshing = false;
    }
  }

  function getRatioColor(t) {
    if (!t || t.error || t.infinite) return t?.infinite ? '#22c55e' : '#6b7280';
    if (t.ratio === null || t.ratio === undefined) return '#6b7280';
    if (t.ratio >= 2) return '#22c55e';
    if (t.ratio >= 1) return '#f97316';
    return '#ef4444';
  }

  function formatRatio(t) {
    if (!t || t.error) return '—';
    if (t.infinite) return '∞';
    return t.ratio === null || t.ratio === undefined ? '—' : t.ratio.toFixed(2);
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    const neg = bytes < 0 ? '-' : '';
    const v = Math.abs(bytes);
    const tib = v / 1024 ** 4;
    if (tib >= 1) return `${neg}${tib.toFixed(2)} To`;
    return `${neg}${(v / 1024 ** 3).toFixed(1)} Go`;
  }

  function formatPoints(pts) {
    if (pts === null || pts === undefined || !Number.isFinite(pts)) return '—';
    if (Math.abs(pts) > 0 && Math.abs(pts) < 100 && pts % 1 !== 0) {
      return pts.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    return Math.round(pts).toLocaleString('fr-FR');
  }

  let trackersWithPoints = $derived(
    indexers.filter(
      (idx) =>
        idx.tracker &&
        !idx.tracker.error &&
        ((idx.tracker.points !== null && idx.tracker.points !== undefined) ||
          (idx.tracker.seeding !== null && idx.tracker.seeding !== undefined) ||
          (idx.tracker.flTokens !== null && idx.tracker.flTokens > 0) ||
          (idx.tracker.extraBadges && idx.tracker.extraBadges.length > 0))
    )
  );

  let totalSeeds = $derived(
    indexers.reduce(
      (sum, idx) =>
        sum + (idx.tracker && Number.isFinite(idx.tracker.seeding) ? idx.tracker.seeding : 0),
      0
    )
  );

  function getHealthColor(idx) {
    if (idx._stat?.averageResponseTimeMs > 2000) return '#ef4444';
    if (idx._stat?.averageResponseTimeMs > 1000) return '#f97316';
    return '#22c55e';
  }

  function formatDate(iso) {
    if (!iso) return 'jamais';
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
</script>

<svelte:head>
  <title>Sortarr — Gestion des indexeurs</title>
</svelte:head>

{#if data.error === 'no_config'}
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <div class="text-6xl mb-6">⚙️</div>
    <h2 class="text-2xl font-bold mb-2">Configuration requise</h2>
    <p class="mb-6" style="color: var(--text-muted);">
      Veuillez configurer votre instance Prowlarr avant de continuer.
    </p>
    <a href="/settings" class="px-6 py-2 rounded-lg font-semibold transition-colors"
       style="background: var(--accent); color: white;">
      Aller aux paramètres
    </a>
  </div>

{:else if data.error}
  <div class="rounded-xl p-6 mb-6" style="background: #ef444422; border: 1px solid #ef4444;">
    <p class="font-semibold text-red-400">❌ Erreur de connexion à Prowlarr</p>
    <p class="text-sm mt-1" style="color: var(--text-muted);">{data.error}</p>
    <a href="/settings" class="mt-3 inline-block text-sm underline text-red-400">Vérifier la configuration →</a>
  </div>

{:else}
  <!-- Scheduler status banner -->
  {#if schedulerStatus?.enabled}
    <div class="flex items-center justify-between rounded-xl px-4 py-2.5 mb-4 text-sm"
         style="background: #7c3aed18; border: 1px solid #7c3aed44;">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full inline-block animate-pulse" style="background: #a855f7;"></span>
        <span style="color: #a78bfa;">
          Auto-tri actif — toutes les {schedulerStatus.intervalMinutes} min
        </span>
        {#if schedulerStatus.lastRun}
          <span style="color: var(--text-muted);">• Dernier passage : {formatDate(schedulerStatus.lastRun)}</span>
        {/if}
      </div>
      <button onclick={triggerAutoSort}
              class="text-xs px-2 py-1 rounded transition-colors"
              style="color: #a78bfa; border: 1px solid #7c3aed44; background: #7c3aed18;">
        ▶ Exécuter maintenant
      </button>
    </div>
  {/if}

  <!-- Header toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-bold">Gestion des indexeurs</h1>
      <p class="text-sm mt-0.5" style="color: var(--text-muted);">
        {indexers.length} indexeur(s) • Actualisé le {lastRefresh.toLocaleTimeString('fr-FR')}
      </p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button onclick={refresh} disabled={isRefreshing}
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style="background: var(--bg-card); border: 1px solid var(--border); color: {isRefreshing ? 'var(--text-muted)' : '#e2e8f0'};">
        {isRefreshing ? '⏳ Chargement...' : '🔄 Actualiser'}
      </button>
      <button onclick={autoSort}
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style="background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa;">
        ✨ Auto-trier (local)
      </button>
      <button onclick={resetOrder}
              class="px-3 py-1.5 rounded-lg text-sm font-medium"
              style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);">
        ↺ Réinitialiser
      </button>
      <button onclick={applyPriorities} disabled={isSaving}
              class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style="background: var(--accent); color: white; opacity: {isSaving ? 0.6 : 1};">
        {isSaving ? '⏳ Application...' : '💾 Appliquer les priorités'}
      </button>
      <button onclick={() => { showHelpModal = true; }}
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer hover:bg-slate-800"
              style="background: var(--bg-card); border: 1px solid var(--border); color: #cbd5e1;"
              title="Comment ça marche ?">
        <span>💡</span>
        <span>Aide ?</span>
      </button>
    </div>
  </div>

  <!-- Save result banner -->
  {#if saveResult}
    <div class="rounded-lg px-4 py-3 mb-4 text-sm font-medium"
         style="background: {saveResult.ok === true ? '#22c55e22' : saveResult.ok === false ? '#ef444422' : '#7c3aed22'}; border: 1px solid {saveResult.ok === true ? '#22c55e' : saveResult.ok === false ? '#ef4444' : '#7c3aed'}; color: {saveResult.ok === true ? '#4ade80' : saveResult.ok === false ? '#f87171' : '#a78bfa'};">
      {saveResult.message}
    </div>
  {/if}

  <!-- Legend -->
  <div class="flex flex-wrap items-center gap-4 mb-4 text-xs" style="color: var(--text-muted);">
    <span class="flex items-center gap-1">
      <span class="w-3 h-3 rounded-full inline-block" style="background: #22c55e;"></span> Ratio ≥ 2
    </span>
    <span class="flex items-center gap-1">
      <span class="w-3 h-3 rounded-full inline-block" style="background: #f97316;"></span> Ratio ≥ 1
    </span>
    <span class="flex items-center gap-1">
      <span class="w-3 h-3 rounded-full inline-block" style="background: #ef4444;"></span> Ratio &lt; 1
    </span>
    <span class="flex items-center gap-1 cursor-help"
          title="Freeleech actif sur ce tracker : les téléchargements ne comptent pas dans votre Download">
      <span class="px-1.5 py-0.5 rounded text-xs font-bold" style="background: #22c55e22; color: #4ade80; border: 1px solid #22c55e;">FL</span> Freeleech actif
    </span>
    <span class="flex items-center gap-1 cursor-help"
          title="Le flux RSS (synchronisation automatique des nouveautés vers Sonarr/Radarr) ou la recherche automatique est désactivé pour cet indexeur dans Prowlarr">
      <span class="px-1.5 py-0.5 rounded text-xs font-semibold" style="background: #f9731622; color: #fb923c; border: 1px solid #f9731644;">PAUSE</span> RSS / Recherche auto désactivé dans Prowlarr
    </span>
  </div>

  <!-- Récapitulatif global des Points / Tokens / Karma / Zen / Crédits & Seeds -->
  {#if trackersWithPoints.length > 0}
    <div class="rounded-xl p-3.5 mb-5" style="background: var(--bg-secondary); border: 1px solid var(--border);">
      <div class="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider" style="color: #a78bfa;">
          🪙 Points, Jetons, Karma, Crédits &amp; Seeds des Trackers Privés
        </span>
        <div class="flex items-center gap-3 text-[11px]" style="color: var(--text-muted);">
          <span class="px-2 py-0.5 rounded font-semibold" style="background: #22c55e18; color: #4ade80; border: 1px solid #22c55e33;">
            🌱 {totalSeeds.toLocaleString('fr-FR')} seeds actifs au total
          </span>
          <span>{trackersWithPoints.length} tracker(s)</span>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {#each trackersWithPoints as idx (idx.id)}
          {@const logoUrl = getTrackerLogo(idx)}
          <div class="rounded-lg px-3 py-2 flex items-center gap-2.5"
               style="background: var(--bg-card); border: 1px solid var(--border);">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
                 style="background: #0b0f19; border: 1px solid var(--border);">
              {#if logoUrl && !failedLogos[idx.id]}
                <img
                  src={logoUrl}
                  alt={idx.name}
                  class="w-5 h-5 object-contain"
                  onerror={() => { failedLogos[idx.id] = true; }}
                />
              {:else}
                <span class="text-[10px] font-extrabold" style="color: #a78bfa;">
                  {getTrackerInitials(idx.name)}
                </span>
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1">
                <div class="text-xs font-semibold truncate" style="color: #e2e8f0;">{idx.name}</div>
                {#if idx.tracker.seeding !== null && idx.tracker.seeding !== undefined}
                  <span class="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0"
                        title="Nombre de torrents en seed sur ce tracker"
                        style="background: #22c55e18; color: #4ade80; border: 1px solid #22c55e33;">
                    🌱 {idx.tracker.seeding}
                  </span>
                {/if}
              </div>
              <div class="flex items-baseline gap-1.5 flex-wrap">
                <span class="text-sm font-extrabold font-mono" style="color: #facc15;">
                  {formatPoints(idx.tracker.points)}
                </span>
                <span class="text-[10px] font-semibold uppercase" style="color: var(--text-muted);">
                  {idx.tracker.pointsLabel || 'POINTS'}
                </span>
                {#if idx.tracker.pointsPerHour}
                  <span class="text-[10px] font-mono font-semibold" style="color: #4ade80;">
                    +{idx.tracker.pointsPerHour}/h
                  </span>
                {/if}
              </div>
              {#if idx.tracker.extraBadges?.length}
                <div class="flex flex-wrap gap-1 mt-0.5">
                  {#each idx.tracker.extraBadges as badge}
                    <span class="text-[10px] px-1.5 py-0.2 rounded"
                          style="background: #7c3aed22; color: #c4b5fd;">
                      {badge}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Indexer list (drag-and-drop) -->
  <div
    use:dndzone={{ items: indexers, flipDurationMs: 200 }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
    class="flex flex-col gap-3"
  >
    {#each indexers as indexer, i (indexer.id)}
      {@const logoUrl = getTrackerLogo(indexer)}
      <div animate:flip={{ duration: 200 }}
           class="rounded-xl p-4 border transition-all hover:border-purple-500/50"
           style="background: var(--bg-card); border-color: var(--border);">
        <div class="flex items-center gap-4">
          <!-- Priority badge + drag handle + Tracker Logo -->
          <div class="flex items-center gap-3 min-w-0">
            <div class="drag-handle text-gray-500 hover:text-purple-400 select-none text-xl" title="Glisser pour réordonner">
              ⠿
            </div>
            <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
                 style="background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44;">
              {i + 1}
            </div>
            <div class="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                 style="background: #0b0f19; border: 1px solid var(--border); box-shadow: inset 0 1px 2px rgba(255,255,255,0.05);">
              {#if logoUrl && !failedLogos[indexer.id]}
                <img
                  src={logoUrl}
                  alt={indexer.name}
                  class="w-7 h-7 object-contain"
                  onerror={() => { failedLogos[indexer.id] = true; }}
                />
              {:else}
                <span class="text-xs font-extrabold tracking-tight" style="color: #a78bfa;">
                  {getTrackerInitials(indexer.name)}
                </span>
              {/if}
            </div>
          </div>

          <!-- Name + badges -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold truncate">{indexer.name}</span>
              
              {#if indexer._hasFreeleech}
                <span class="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0 cursor-help"
                      title="Freeleech actif : les téléchargements sur ce tracker ne décomptent pas votre ratio"
                      style="background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44;">
                  FL
                </span>
              {/if}

              {#if !indexer.enableRss || !indexer.enableAutomaticSearch}
                <span class="px-1.5 py-0.5 rounded text-xs flex-shrink-0 cursor-help"
                      title={`En pause partielle ou totale dans Prowlarr — Flux RSS : ${indexer.enableRss ? 'Activé' : 'Désactivé'} • Recherche auto : ${indexer.enableAutomaticSearch !== false ? 'Activée' : 'Désactivée'} • Recherche manuelle : ${indexer.enableInteractiveSearch !== false ? 'Activée' : 'Désactivée'}`}
                      style="background: #f9731622; color: #fb923c; border: 1px solid #f9731644;">
                  PAUSE
                </span>
              {/if}

              {#if indexer.hasNoArrTag}
                <span class="px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0 cursor-help flex items-center gap-1"
                      title={`Tag "${indexer.taggingTag || 'no-arr'}" actif dans Prowlarr : exclu des téléchargements automatiques Radarr et Sonarr`}
                      style="background: #ef444422; color: #f87171; border: 1px solid #ef444455;">
                  🏷️ {indexer.taggingTag || 'no-arr'}
                </span>
              {/if}

              <span class="px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                    style="background: {indexer.privacy === 'private' ? '#7c3aed22' : indexer.privacy === 'semiPrivate' ? '#f9731622' : '#22c55e22'}; 
                           color: {indexer.privacy === 'private' ? '#a78bfa' : indexer.privacy === 'semiPrivate' ? '#fb923c' : '#4ade80'};
                           border: 1px solid {indexer.privacy === 'private' ? '#7c3aed44' : indexer.privacy === 'semiPrivate' ? '#f9731644' : '#22c55e44'};">
                {indexer.privacy === 'private' ? 'Privé' : indexer.privacy === 'semiPrivate' ? 'Semi-privé' : 'Public'}
              </span>

              {#if indexer.tracker && indexer.tracker.seeding !== null && indexer.tracker.seeding !== undefined}
                <span class="px-1.5 py-0.5 rounded text-[11px] font-semibold flex-shrink-0"
                      title="Nombre de torrents actuellement en seed sur ce tracker"
                      style="background: #22c55e18; color: #4ade80; border: 1px solid #22c55e38;">
                  🌱 {indexer.tracker.seeding} seed{indexer.tracker.seeding > 1 ? 's' : ''}
                </span>
              {/if}

              {#if indexer.tracker?.extraBadges?.length}
                {#each indexer.tracker.extraBadges as badge}
                  <span class="px-1.5 py-0.5 rounded text-[11px] font-medium flex-shrink-0"
                        style="background: #eab30818; color: #fde047; border: 1px solid #eab30844;">
                    {badge}
                  </span>
                {/each}
              {/if}
            </div>
            <div class="text-xs mt-0.5" style="color: var(--text-muted);">
              ID: {indexer.id} • Priorité Prowlarr: {indexer.priority ?? 'N/A'}
            </div>
          </div>

          <!-- Stats réelles du tracker -->
          {#if indexer.tracker?.public}
            <div class="hidden sm:flex items-center gap-4 text-xs text-right flex-shrink-0">
              <div style="color: var(--text-muted);">
                Tracker public<br />pas de ratio
              </div>
              <div class="pl-3" style="border-left: 1px solid var(--border);">
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">SEEDS</div>
                <div class="font-semibold text-sm" style="color: #4ade80;">
                  {indexer.tracker.seeding !== null && indexer.tracker.seeding !== undefined ? indexer.tracker.seeding : '—'}
                </div>
              </div>
            </div>
          {:else if indexer.tracker?.error}
            <div class="hidden sm:block text-xs text-right max-w-[16rem] flex-shrink-0" style="color: #f87171;" title={indexer.tracker.error}>
              ⚠️ Stats indisponibles<br /><span class="truncate block" style="color: var(--text-muted);">{indexer.tracker.error}</span>
            </div>
          {:else if indexer.tracker}
            <div class="hidden sm:grid grid-cols-6 gap-3.5 text-xs text-right flex-shrink-0">
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">RATIO</div>
                <div class="font-bold text-sm" style="color: {getRatioColor(indexer.tracker)};">
                  {formatRatio(indexer.tracker)}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">UPLOAD</div>
                <div class="font-semibold" style="color: #4ade80;">{formatBytes(indexer.tracker.uploaded)}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">DOWNLOAD</div>
                <div class="font-semibold">{formatBytes(indexer.tracker.downloaded)}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">BUFFER</div>
                <div class="font-semibold" style="color: {indexer.tracker.buffer < 0 ? '#ef4444' : '#4ade80'};">
                  {indexer.tracker.infinite && indexer.tracker.buffer === null ? '∞' : formatBytes(indexer.tracker.buffer)}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">
                  {indexer.tracker.pointsLabel || 'POINTS'}
                </div>
                <div class="font-bold" style="color: #facc15;">
                  {formatPoints(indexer.tracker.points)}
                </div>
                {#if indexer.tracker.pointsPerHour}
                  <div class="text-[10px] font-mono" style="color: #4ade80;">
                    +{indexer.tracker.pointsPerHour}/h
                  </div>
                {/if}
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider" style="color: var(--text-muted);">SEEDS</div>
                <div class="font-semibold" style="color: #4ade80;">
                  {indexer.tracker.seeding !== null && indexer.tracker.seeding !== undefined ? indexer.tracker.seeding : '—'}
                </div>
                {#if indexer.tracker.leeching}
                  <div class="text-[10px] font-mono" style="color: #fb923c;" title="Torrents en téléchargement (leech)">
                    ⬇️ {indexer.tracker.leeching} DL
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="hidden sm:block text-xs text-right flex-shrink-0" style="color: var(--text-muted);">
              Tracker non configuré<br />
              <a href="/settings" class="underline" style="color: #a78bfa;">Configurer</a>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if indexers.length === 0}
    <div class="text-center py-16" style="color: var(--text-muted);">
      <div class="text-4xl mb-4">🔍</div>
      <p>Aucun indexeur trouvé sur Prowlarr.</p>
    </div>
  {/if}
{/if}

<!-- Modal d'Aide : Comment ça marche ? -->
{#if showHelpModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(6px);"
    onclick={(e) => { if (e.target === e.currentTarget) showHelpModal = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') showHelpModal = false; }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      style="background: #13141f; border: 1px solid var(--border); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);"
    >
      <!-- Header de la modal -->
      <div class="px-5 py-4 flex items-center justify-between border-b" style="border-color: var(--border); background: #1a1a24;">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-lg flex items-center justify-center text-base" style="background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed55;">
            💡
          </span>
          <div>
            <h2 class="text-base font-bold text-white">Comment ça marche ?</h2>
            <p class="text-xs" style="color: var(--text-muted);">Guide d'utilisation et fonctionnement de Sortarr</p>
          </div>
        </div>
        <button
          type="button"
          onclick={() => (showHelpModal = false)}
          class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors cursor-pointer hover:bg-slate-800"
          style="color: var(--text-muted);"
          aria-label="Fermer la modal"
        >
          ✕
        </button>
      </div>

      <!-- Corps de la modal -->
      <div class="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed" style="color: #cbd5e1;">
        <!-- Section 1 : Priorités & Auto-tri -->
        <div class="p-3.5 rounded-xl space-y-2" style="background: #1a1a24; border: 1px solid var(--border);">
          <div class="font-bold text-sm flex items-center gap-2" style="color: #a78bfa;">
            <span>🎯</span>
            <span>Gestion des priorités Prowlarr</span>
          </div>
          <ul class="space-y-1.5 pl-1">
            <li>
              • <strong class="text-white">Glisser-déposer :</strong> Utilisez la poignée à 6 points <span class="font-mono text-[10px] px-1 py-0.5 rounded bg-slate-800">⠿</span> à gauche de chaque indexeur pour réordonner manuellement selon vos préférences.
            </li>
            <li>
              • <strong class="text-white">✨ Auto-trier (local) :</strong> Réorganise instantanément les indexeurs selon l'algorithme intelligent :
              <ol class="list-decimal pl-6 mt-1 space-y-0.5" style="color: #94a3b8;">
                <li>Trackers sans ratio (publics) ou à ratio infini (<span class="font-bold text-emerald-400">∞</span>) en tête.</li>
                <li>Trackers avec <span class="font-semibold text-emerald-400">Freeleech actif (FL)</span> classés du plus haut ratio au plus bas.</li>
                <li>Autres trackers privés triés du plus haut ratio au plus bas (départage par buffer net en cas d'égalité).</li>
              </ol>
            </li>
            <li>
              • <strong class="text-white">💾 Appliquer les priorités :</strong> Envoie l'ordre calculé (<code class="text-purple-300">1 à N</code>) directement à votre instance Prowlarr via l'API pour que Sonarr et Radarr interrogent vos trackers dans cet ordre.
            </li>
          </ul>
        </div>

        <!-- Section 2 : Protection du ratio no-arr -->
        <div class="p-3.5 rounded-xl space-y-2" style="background: #1a1a24; border: 1px solid var(--border);">
          <div class="font-bold text-sm flex items-center gap-2" style="color: #f87171;">
            <span>🏷️</span>
            <span>Protection du ratio par Tag (no-arr)</span>
          </div>
          <p>
            Si un tracker privé passe sous votre seuil de ratio minimum (ex: <code class="text-purple-300">1.0</code>), Sortarr lui attribue automatiquement le tag d'exclusion <code class="text-red-400">no-arr</code> dans Prowlarr, Radarr et Sonarr.
          </p>
          <ul class="space-y-1.5 pl-1">
            <li>
              • <strong class="text-white">Radarr &amp; Sonarr :</strong> Vos indexeurs sous le seuil ne recevront plus de téléchargements automatiques, évitant ainsi de ruiner votre ratio.
            </li>
            <li>
              • <strong class="text-white">Cross-seed :</strong> Le tracker reste opérationnel dans Prowlarr pour compléter vos torrents en seed.
            </li>
            <li>
              • <strong class="text-white">Rétablissement automatique :</strong> Dès que votre ratio remonte au-dessus du seuil, le tag est automatiquement retiré.
            </li>
          </ul>
        </div>

        <!-- Section 3 : Badges & Indicateurs -->
        <div class="p-3.5 rounded-xl space-y-2" style="background: #1a1a24; border: 1px solid var(--border);">
          <div class="font-bold text-sm flex items-center gap-2" style="color: #facc15;">
            <span>⚡</span>
            <span>Badges et symboles</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44;">FL</span>
              <span>Tracker en Freeleech (aucun download décompté).</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="background: #ef444422; color: #f87171; border: 1px solid #ef444455;">🏷️ no-arr</span>
              <span>Indexeur exclu des grabs auto par protection de ratio.</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background: #f9731622; color: #fb923c; border: 1px solid #f9731644;">PAUSE</span>
              <span>Indexeur en pause partielle ou totale dans Prowlarr.</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px]" style="background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44;">Privé</span>
              <span>Type de tracker (Privé, Semi-privé ou Public).</span>
            </div>
          </div>
        </div>

        <!-- Section 4 : Planificateur automatique -->
        <div class="p-3.5 rounded-xl space-y-1.5" style="background: #1a1a24; border: 1px solid var(--border);">
          <div class="font-bold text-sm flex items-center gap-2" style="color: #4ade80;">
            <span>⏱️</span>
            <span>Auto-tri et actualisation en arrière-plan</span>
          </div>
          <p>
            Le planificateur de Sortarr s'exécute côté serveur à l'intervalle configuré (ex: toutes les 20 min). Il récupère les statistiques réelles de vos trackers, réordonne les indexeurs Prowlarr et synchronise les tags même lorsque votre navigateur est fermé.
          </p>
        </div>
      </div>

      <!-- Footer de la modal -->
      <div class="px-5 py-3.5 border-t flex items-center justify-end" style="border-color: var(--border); background: #1a1a24;">
        <button
          type="button"
          onclick={() => (showHelpModal = false)}
          class="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          style="background: var(--accent); color: white;"
        >
          Compris !
        </button>
      </div>
    </div>
  </div>
{/if}
