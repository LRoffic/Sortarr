/**
 * Action Svelte : déclenche des animations fluides lorsque l'élément entre dans l'écran
 */
export function animateOnVisible(node, options = {}) {
  const { className = 'is-visible', threshold = 0.1, delay = 0 } = options;

  let timer = null;
  if (typeof IntersectionObserver === 'undefined') {
    node.classList.add(className);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            timer = setTimeout(() => {
              node.classList.add(className);
            }, delay);
          } else {
            node.classList.add(className);
          }
          observer.unobserve(node);
        }
      });
    },
    { threshold }
  );

  observer.observe(node);

  return {
    destroy() {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    }
  };
}
