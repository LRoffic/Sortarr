/**
 * Utilitaires de formatage de dates et heures pour l'interface Sortarr
 */

/**
 * Formate une date ISO ou timestamp en format lisible en français :
 * "JJ/MM/AAAA à HH:mm" (ex: "05/11/2026 à 06:40")
 * @param {string|Date|number|null} isoStr
 * @returns {string}
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timePart = d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${datePart} à ${timePart}`;
  } catch {
    return '';
  }
}

/**
 * Formate une date au format court "JJ/MM/AAAA"
 * @param {string|Date|number|null} isoStr
 * @returns {string}
 */
export function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}
