<script>
  import '../app.css';
  import { page } from '$app/stores';
  let { data, children } = $props();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
</script>

<div class="min-h-screen flex flex-col" style="background: var(--bg-primary);">
  <!-- Navbar -->
  <nav class="border-b" style="background: var(--bg-secondary); border-color: var(--border);">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" 
             style="background: var(--accent); color: white;">
          S
        </div>
        <span class="font-bold text-lg tracking-tight">Sortarr</span>
        <span class="text-xs px-2 py-0.5 rounded-full" style="background: #7c3aed22; color: #a78bfa;">
          Prowlarr Priority Manager
        </span>
      </div>
      {#if data?.user}
        <div class="flex items-center gap-1.5">
          <a href="/" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{$page.url.pathname === '/' ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
            Indexeurs
          </a>
          <a href="/stats" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{$page.url.pathname.startsWith('/stats') ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
            📈 Statistiques
          </a>
          <a href="/settings" 
             class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
             style="{$page.url.pathname === '/settings' ? 'background: var(--accent); color: white;' : 'color: var(--text-muted);'}">
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
    Sortarr • Données actualisées manuellement ou toutes les 20 min
  </footer>
</div>
