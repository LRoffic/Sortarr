<script>
  import { onMount } from 'svelte';

  let visible = $state(false);
  let text = $state('');
  let x = $state(0);
  let y = $state(0);
  let placement = $state('top'); // 'top' | 'bottom'
  let arrowOffset = $state(0);
  let tooltipEl = $state(null);

  let showTimeout = null;
  let activeTarget = null;

  function hide() {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    activeTarget = null;
    visible = false;
  }

  function positionTooltip(target) {
    if (!tooltipEl || !target) return;

    const targetRect = target.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const margin = 8;
    const arrowSize = 6;

    // Calcul horizontal centré sur le target
    let targetCenterX = targetRect.left + targetRect.width / 2;
    let tipLeft = targetCenterX - tipRect.width / 2;

    // Empêcher le débordement des bords de l'écran
    const padding = 10;
    if (tipLeft < padding) {
      tipLeft = padding;
    } else if (tipLeft + tipRect.width > window.innerWidth - padding) {
      tipLeft = window.innerWidth - padding - tipRect.width;
    }

    // Déterminer la flèche par rapport au centre du target
    arrowOffset = targetCenterX - tipLeft;

    // Déterminer le placement vertical (au-dessus par défaut, en-dessous si manque d'espace au-dessus)
    let place = 'top';
    let tipTop = targetRect.top - tipRect.height - margin;

    if (tipTop < padding) {
      // Pas assez de place en haut, basculer en bas
      place = 'bottom';
      tipTop = targetRect.bottom + margin;
    }

    x = Math.round(tipLeft);
    y = Math.round(tipTop);
    placement = place;
  }

  function handlePointerOver(e) {
    const target = e.target?.closest?.('[data-tooltip], [title]');
    if (!target) return;

    // Si l'élément a un attribut title natif, le convertir en data-tooltip pour éviter le tooltip natif du navigateur
    let content = target.getAttribute('data-tooltip');
    if (!content && target.hasAttribute('title')) {
      content = target.getAttribute('title');
      if (content && content.trim()) {
        target.setAttribute('data-tooltip', content);
        target.removeAttribute('title');
      }
    }

    if (!content || !content.trim()) return;

    if (activeTarget === target && visible) {
      // Met à jour le texte si dynamique
      text = content;
      return;
    }

    activeTarget = target;
    text = content;

    if (showTimeout) clearTimeout(showTimeout);

    // Déclenchement rapide et fluide (Web Awesome style : ~80ms)
    showTimeout = setTimeout(() => {
      visible = true;
      // Positionner au prochain tick une fois le texte rendu dans le DOM
      requestAnimationFrame(() => {
        positionTooltip(target);
      });
    }, 70);
  }

  function handlePointerOut(e) {
    const target = e.target?.closest?.('[data-tooltip]');
    if (target && target === activeTarget) {
      // Vérifier si on est entré dans un enfant du même target
      const related = e.relatedTarget?.closest?.('[data-tooltip]');
      if (related === activeTarget) return;
      hide();
    }
  }

  function handleScroll() {
    if (visible) hide();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') hide();
  }

  onMount(() => {
    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (showTimeout) clearTimeout(showTimeout);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div
  bind:this={tooltipEl}
  role="tooltip"
  aria-hidden={!visible}
  class="wa-tooltip"
  class:wa-visible={visible}
  class:wa-top={placement === 'top'}
  class:wa-bottom={placement === 'bottom'}
  style="transform: translate3d({x}px, {y}px, 0);"
>
  <div class="wa-tooltip-content">
    {text}
  </div>
  <div
    class="wa-tooltip-arrow"
    style="left: {arrowOffset}px;"
  ></div>
</div>

<style>
  .wa-tooltip {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 99999;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 140ms cubic-bezier(0.4, 0, 0.2, 1),
      visibility 140ms linear,
      transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
    will-change: transform, opacity;
  }

  .wa-tooltip.wa-visible {
    opacity: 1;
    visibility: visible;
  }

  .wa-tooltip-content {
    background: #0f172a; /* Slate 900 profond Web Awesome */
    color: #f8fafc; /* Blanc doux */
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.65),
      0 8px 10px -6px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(147, 51, 234, 0.15); /* Légère touche violette Sortarr */
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.45;
    padding: 6px 10px;
    border-radius: 6px;
    max-width: 320px;
    white-space: pre-line;
    word-break: break-word;
    text-align: center;
    letter-spacing: 0.01em;
  }

  .wa-tooltip-arrow {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #0f172a;
    transform: translateX(-50%) rotate(45deg);
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  .wa-top .wa-tooltip-arrow {
    bottom: -4px;
    border-top: none;
    border-left: none;
  }

  .wa-bottom .wa-tooltip-arrow {
    top: -4px;
    border-bottom: none;
    border-right: none;
  }
</style>
