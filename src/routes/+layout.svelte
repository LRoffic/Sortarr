<script>
  import '../app.css';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import Tooltip from '$lib/Tooltip.svelte';
  import { formatDateTime } from '$lib/formatters.js';

  let { data, children } = $props();
  let updateInfo = $state(null);

  let lastUpdateTooltip = $derived.by(() => {
    const version = data?.currentVersion || '1.0.0';
    const date = data?.lastUpdatedAt ? formatDateTime(data.lastUpdatedAt) : '';
    if (date) {
      return `Version v${version} — Dernière mise à jour : ${date}`;
    }
    return `Version v${version}`;
  });

  onMount(async () => {
    if (!data?.user) return;
    try {
      const res = await fetch('/api/update');
      if (res.ok) {
        updateInfo = await res.json();
      }
    } catch {}
  });

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
</script>

<div class="min-h-screen flex flex-col" style="background: var(--bg-primary);">
  <!-- Navbar fixe en haut de page -->
  <nav class="sticky top-0 z-40 border-b shadow-md transition-shadow"
       style="background: #1a1a24f0; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-color: var(--border);">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <img src="/favicon.jpg" alt="Sortarr" class="w-8 h-8 rounded-lg object-cover shadow-sm" />
        <span class="font-bold text-lg tracking-tight">Sortarr</span>
        <span
          class="text-[11px] font-mono px-2 py-0.5 rounded-full cursor-help transition-opacity hover:opacity-85"
          style="background: #7c3aed22; color: #a78bfa;"
          data-tooltip={lastUpdateTooltip}
        >
          v{data?.currentVersion || '1.0.0'}
        </span>
        {#if updateInfo?.updateAvailable}
          <a
            href="/settings#update"
            class="text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 transition-transform hover:scale-105"
            style="background: #22c55e22; color: #4ade80; border: 1px solid #22c55e66;"
            data-tooltip={`Nouvelle version ${updateInfo.tagName} disponible${updateInfo.publishedAt ? ` (publiée le ${formatDateTime(updateInfo.publishedAt)})` : ''} — Cliquez pour mettre à jour`}
          >
            ⬆️ Mise à jour v{updateInfo.latestVersion} dispo !
          </a>
        {/if}
      </div>
      {#if data?.user}
        <div class="flex items-center gap-1.5 flex-wrap">
          <a href="/" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{page.url.pathname === '/' ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
            Indexeurs
          </a>
          <a href="/stats" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{page.url.pathname.startsWith('/stats') ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
            📈 Statistiques
          </a>
          <a href="/settings" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{page.url.pathname === '/settings' ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
            ⚙️ Configuration
          </a>
          <button
            type="button"
            onclick={handleLogout}
            title="Connecté en tant que {data.user.username}"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-2 cursor-pointer"
            style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);"
          >
            🚪 Déconnexion ({data.user.username})
          </button>
        </div>
      {/if}
    </div>
  </nav>

  <main class="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
    {@render children()}
  </main>

  <footer class="text-center py-4 text-xs" style="color: var(--text-muted);">
    <span
      class="cursor-help underline decoration-dotted transition-colors hover:text-slate-200"
      data-tooltip={lastUpdateTooltip}
    >
      Sortarr v{data?.currentVersion || '1.0.0'}
    </span>
    • <a href="https://github.com/LRoffic/Sortarr/releases" target="_blank" class="underline hover:text-purple-400">GitHub Releases</a> • Données actualisées manuellement ou toutes les 20 min
  </footer>

  <Tooltip />
</div>
