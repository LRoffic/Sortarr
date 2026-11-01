/**
 * Règle de tri (par ordre croissant de priorité Prowlarr 1, 2, 3...) :
 *  1. Trackers sans ratio (publics) ou en ratio infini (∞) : TOUJOURS en tête
 *  2. Puis les trackers en freeleech (FL) : du plus haut ratio au plus bas ratio
 *  3. Puis les autres trackers privés : du plus haut ratio au plus bas ratio
 *  4. Enfin les trackers non configurés ou en erreur : ordre actuel conservé
 */
export function sortIndexers(list) {
  const isNoRatioOrInfinite = (a) =>
    a.tracker?.public === true ||
    a.privacy === 'public' ||
    a.tracker?.infinite === true;
  const fl = (a) => a.tracker?.freeleech === true;
  const buf = (a) => (typeof a.tracker?.buffer === 'number' ? a.tracker.buffer : null);
  const ratio = (a) => (typeof a.tracker?.ratio === 'number' ? a.tracker.ratio : null);

  return [...list].sort((a, b) => {
    const infA = isNoRatioOrInfinite(a);
    const infB = isNoRatioOrInfinite(b);

    // 1. Sans ratio (public) ou ratio infini (∞) toujours en premier
    if (infA !== infB) return infA ? -1 : 1;

    if (infA && infB) {
      // Parmi les sans-ratio / ratio infini : freeleech actif d'abord, puis buffer décroissant
      if (fl(a) !== fl(b)) return fl(a) ? -1 : 1;
      const ba = buf(a);
      const bb = buf(b);
      if (ba !== null && bb !== null && ba !== bb) return bb - ba;
      return (a.priority ?? 50) - (b.priority ?? 50);
    }

    // 2. Freeleech en priorité devant les autres trackers à ratio
    if (fl(a) !== fl(b)) return fl(a) ? -1 : 1;

    const ra = ratio(a);
    const rb = ratio(b);
    // Sans ratio connu : après ceux qui ont un ratio connu
    if ((ra === null) !== (rb === null)) return ra === null ? 1 : -1;
    if (ra !== null && rb !== null && ra !== rb) {
      // Le plus haut ratio en premier (priorités 1, 2, 3... croissantes)
      return rb - ra;
    }

    const ba = buf(a);
    const bb = buf(b);
    if (ba !== null && bb !== null && ba !== bb) {
      return bb - ba;
    }

    return (a.priority ?? 50) - (b.priority ?? 50);
  });
}
