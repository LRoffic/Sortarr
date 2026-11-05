<script>
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Sortarr — Erreur {page.status}</title>
</svelte:head>

<div class="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
  <div class="p-8 rounded-2xl max-w-md w-full" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div class="text-5xl font-black mb-3" style="color: #a78bfa;">
      {page.status}
    </div>
    <h1 class="text-xl font-bold mb-2" style="color: #f1f5f9;">
      {#if page.status === 404}
        Page introuvable
      {:else if page.status === 500}
        Erreur interne du serveur
      {:else}
        Une erreur est survenue
      {/if}
    </h1>
    <p class="text-sm mb-6" style="color: var(--text-muted);">
      {page.error?.message || 'Une opération inattendue s\'est produite.'}
    </p>

    <div class="flex items-center justify-center gap-3">
      <a
        href="/"
        class="btn btn-primary text-sm px-4 py-2 inline-flex items-center gap-2"
      >
        <span>🏠</span>
        <span>Retour aux indexeurs</span>
      </a>
      <button
        type="button"
        onclick={() => history.back()}
        class="btn btn-secondary text-sm px-4 py-2"
      >
        Retour
      </button>
    </div>
  </div>
</div>
