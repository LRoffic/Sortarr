<script>
  import { onMount } from 'svelte';

  let {
    chart,
    trackerId,
    activeMetric = 'ratio',
    ptsLabel = 'Points',
    isAstra = false
  } = $props();

  let containerEl = $state(null);
  let progress = $state(0);
  let isVisible = $state(false);
  let animFrameId = null;

  const baselineY = 94;

  function fmtShortDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  }

  function fmtPoints(pts) {
    if (pts === null || pts === undefined || !Number.isFinite(pts)) return '—';
    if (Math.abs(pts) > 0 && Math.abs(pts) < 100 && pts % 1 !== 0) {
      return pts.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    return Math.round(pts).toLocaleString('fr-FR');
  }

  function animateTo(targetVal, duration = 850) {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const startVal = progress;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const rawT = Math.min(1, elapsed / duration);
      // Courbe ease-out cubique très douce
      const easeOut = 1 - Math.pow(1 - rawT, 3);
      progress = startVal + (targetVal - startVal) * easeOut;

      if (rawT < 1) {
        animFrameId = requestAnimationFrame(step);
      } else {
        progress = targetVal;
      }
    }

    animFrameId = requestAnimationFrame(step);
  }

  onMount(() => {
    if (!containerEl || typeof IntersectionObserver === 'undefined') {
      progress = 1;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible = true;
            // Réinitialise à 0.0 puis anime vers 1.0 au scroll
            progress = 0;
            animateTo(1, 850);
          } else {
            isVisible = false;
            progress = 0;
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(containerEl);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      observer.disconnect();
    };
  });

  // Réanime si les données changent pendant que le graphique est visible
  let lastPointsRef = null;
  $effect(() => {
    const pts = chart?.points;
    if (isVisible && pts && pts !== lastPointsRef) {
      lastPointsRef = pts;
      progress = 0;
      animateTo(1, 850);
    }
  });

  // Calcul dynamique des coordonnées animées depuis le bas (y = baselineY = 94, val = 0.0)
  let animatedPoints = $derived(
    (chart?.points || []).map((pt) => {
      const curY = baselineY - (baselineY - pt.y) * progress;
      const curVal = (pt.val ?? 0) * progress;
      const barH = Math.max(0, baselineY - curY);
      return {
        ...pt,
        curY,
        curVal,
        barH
      };
    })
  );

  let animatedPolyline = $derived(
    animatedPoints.map((p) => `${p.x},${p.curY.toFixed(1)}`).join(' ')
  );

  let animatedArea = $derived(
    animatedPoints.length > 1
      ? `${animatedPoints[0].x},${baselineY} ${animatedPolyline} ${animatedPoints[animatedPoints.length - 1].x},${baselineY}`
      : ''
  );
</script>

<div
  bind:this={containerEl}
  class="rounded-xl p-3"
  style="background: var(--bg-secondary); border: 1px solid var(--border);"
>
  <div class="flex items-center justify-between text-xs mb-1.5">
    <span class="font-semibold" style="color: #cbd5e1;">
      {#if activeMetric === 'astra'}
        🪙 Évolution Astra ({chart.points.length} jour{chart.points.length > 1 ? 's' : ''})
      {:else if activeMetric === 'karma'}
        ✨ Évolution Karma ({chart.points.length} jour{chart.points.length > 1 ? 's' : ''})
      {:else if chart.isPoints}
        🪙 Évolution {ptsLabel} ({chart.points.length} jour{chart.points.length > 1 ? 's' : ''})
      {:else}
        {chart.isUploadFallback ? 'Évolution Upload (Go)' : '📈 Évolution du Ratio'} ({chart.points.length} jour{chart.points.length > 1 ? 's' : ''})
      {/if}
    </span>
    <span style="color: var(--text-muted);">
      Min : <strong>{chart.isPoints ? fmtPoints(chart.min) : chart.min.toFixed(2)}</strong> • Max : <strong>{chart.isPoints ? fmtPoints(chart.max) : chart.max.toFixed(2)}</strong>
    </span>
  </div>

  <svg viewBox="0 0 540 110" class="w-full h-28 overflow-visible">
    <defs>
      <linearGradient id="grad-{trackerId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={activeMetric === 'astra' ? '#a855f7' : chart.isPoints ? '#eab308' : '#8b5cf6'} stop-opacity="0.35" />
        <stop offset="100%" stop-color={activeMetric === 'astra' ? '#a855f7' : chart.isPoints ? '#eab308' : '#8b5cf6'} stop-opacity="0.0" />
      </linearGradient>
    </defs>

    <!-- Barres verticales qui s'élèvent depuis 0.0 (baseline y=94) jusqu'à leur hauteur réelle -->
    {#each animatedPoints as pt}
      {@const barW = Math.max(3, Math.min(8, Math.floor(400 / animatedPoints.length)))}
      {#if pt.barH > 0.5}
        <rect
          x={pt.x - barW / 2}
          y={pt.curY}
          width={barW}
          height={pt.barH}
          rx="2"
          fill="url(#grad-{trackerId})"
          stroke={activeMetric === 'astra' ? '#c084fc' : chart.isPoints ? '#facc15' : '#8b5cf6'}
          stroke-opacity="0.35"
          stroke-width="1"
          class="cursor-pointer"
          data-tooltip="{pt.date} : {chart.isPoints ? fmtPoints(pt.val) : pt.val}"
        />
      {/if}
    {/each}

    <!-- Fond dégradé sous la courbe s'élevant depuis le bas -->
    {#if animatedArea}
      <polygon points={animatedArea} fill="url(#grad-{trackerId})" />
    {/if}

    <!-- Courbe reliant les points qui monte depuis la ligne horizontale 0.0 -->
    {#if animatedPoints.length > 1}
      <polyline
        fill="none"
        stroke={activeMetric === 'astra' ? '#c084fc' : chart.isPoints ? '#facc15' : '#a78bfa'}
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        points={animatedPolyline}
      />
    {/if}

    <!-- Points et étiquettes montant depuis 0.0 jusqu'à leurs coordonnées finales -->
    {#each animatedPoints as pt}
      <g>
        <circle
          cx={pt.x}
          cy={pt.curY}
          r="4"
          fill={activeMetric === 'astra' ? '#c084fc' : chart.isPoints ? '#facc15' : '#4ade80'}
          stroke="#0f172a"
          stroke-width="1.5"
          class="cursor-pointer"
          data-tooltip="{pt.date} : {chart.isPoints ? fmtPoints(pt.val) : pt.val}"
        />

        {#if animatedPoints.length <= 14}
          <text
            x={pt.x}
            y={pt.curY - 8}
            text-anchor="middle"
            fill="#cbd5e1"
            font-size="9"
            font-family="monospace"
          >
            {chart.isPoints ? fmtPoints(pt.curVal) : pt.curVal.toFixed(2)}
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
