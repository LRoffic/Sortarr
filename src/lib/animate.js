/**
 * Action Svelte : déclenche les animations au scroll dès que l'élément entre dans la zone visible
 */
export function scrollAnimate(node, options = {}) {
  const { className = 'in-view', threshold = 0.12, once = false } = options;

  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    node.classList.add(className);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          node.classList.add(className);
          if (once) {
            observer.unobserve(node);
          }
        } else if (!once) {
          node.classList.remove(className);
        }
      });
    },
    { threshold }
  );

  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    }
  };
}

export const animateOnVisible = scrollAnimate;
