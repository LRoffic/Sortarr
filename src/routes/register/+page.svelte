<script>
  let username = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let isSubmitting = $state(false);
  let error = $state('');

  // Étape optionnelle de configuration 2FA juste après l'inscription
  let registered = $state(false);
  let totpSecret = $state('');
  let otpauthUri = $state('');
  let totpCode = $state('');
  let backupCodes = $state([]);

  async function handleRegister(event) {
    event?.preventDefault();
    isSubmitting = true;
    error = '';
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword })
      });
      const data = await res.json();
      if (!data.ok) {
        error = data.error || "Erreur lors de l'inscription";
      } else {
        // Génère immédiatement une proposition de configuration 2FA
        const r2 = await fetch('/api/auth/2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setup' })
        });
        const d2 = await r2.json();
        if (d2.ok) {
          totpSecret = d2.secret;
          otpauthUri = d2.otpauthUri;
          registered = true;
        } else {
          window.location.href = '/';
        }
      }
    } catch (e) {
      error = e.message;
    } finally {
      isSubmitting = false;
    }
  }

  async function confirm2FA(event) {
    event?.preventDefault();
    isSubmitting = true;
    error = '';
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: totpCode })
      });
      const data = await res.json();
      if (!data.ok) {
        error = data.error || 'Code invalide';
      } else {
        backupCodes = data.backupCodes || [];
      }
    } catch (e) {
      error = e.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Sortarr — Inscription Administrateur</title>
</svelte:head>

<div class="max-w-md mx-auto mt-10">
  <div class="rounded-2xl p-6 shadow-xl" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    {#if !registered}
      <div class="text-center mb-6">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl mx-auto mb-3"
             style="background: var(--accent); color: white;">
          S
        </div>
        <h1 class="text-2xl font-bold">Bienvenue sur Sortarr</h1>
        <p class="text-xs mt-1" style="color: var(--text-muted);">
          Aucun utilisateur n'est enregistré. Créez votre compte administrateur pour sécuriser l'accès aux indexeurs et à la configuration.
        </p>
      </div>

      {#if error}
        <div class="rounded-xl p-3 mb-4 text-xs"
             style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;">
          ❌ {error}
        </div>
      {/if}

      <form onsubmit={handleRegister} class="space-y-4">
        <div>
          <label class="block text-xs font-semibold mb-1.5" for="username">
            👤 Identifiant
          </label>
          <input
            id="username"
            type="text"
            required
            autocomplete="username"
            bind:value={username}
            placeholder="admin"
            class="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold mb-1.5" for="password">
            🔑 Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            autocomplete="new-password"
            bind:value={password}
            placeholder="••••••••"
            class="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold mb-1.5" for="confirmPassword">
            🔒 Confirmer le mot de passe
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autocomplete="new-password"
            bind:value={confirmPassword}
            placeholder="••••••••"
            class="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          class="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity mt-2 cursor-pointer"
          style="background: var(--accent); color: white; opacity: {isSubmitting ? 0.6 : 1};"
        >
          {isSubmitting ? '⏳ Création du compte...' : '🚀 Créer le compte'}
        </button>
      </form>
    {:else if backupCodes.length > 0}
      <!-- Codes de secours générés -->
      <div class="text-center mb-4">
        <div class="text-3xl mb-2">✅</div>
        <h2 class="text-xl font-bold">Double authentification activée !</h2>
        <p class="text-xs mt-1" style="color: var(--text-muted);">
          Conservez précieusement ces 6 codes de secours à usage unique en cas de perte de votre téléphone :
        </p>
      </div>
      <div class="grid grid-cols-2 gap-2 p-3 rounded-xl font-mono text-xs text-center mb-5"
           style="background: var(--bg-card); border: 1px solid var(--border); color: #a78bfa;">
        {#each backupCodes as code}
          <div class="py-1 px-2 rounded" style="background: var(--bg-secondary);">{code}</div>
        {/each}
      </div>
      <a
        href="/"
        class="block w-full py-2.5 rounded-lg text-sm font-semibold text-center"
        style="background: var(--accent); color: white;"
      >
        Accéder à Sortarr →
      </a>
    {:else}
      <!-- Proposition d'activation 2FA immédiate -->
      <div class="text-center mb-4">
        <h2 class="text-xl font-bold">🔐 Activer la double authentification (2FA)</h2>
        <p class="text-xs mt-1" style="color: var(--text-muted);">
          Scannez ce QR Code avec Google Authenticator, Authy ou Bitwarden, puis saisissez le code à 6 chiffres.
        </p>
      </div>

      {#if error}
        <div class="rounded-xl p-3 mb-4 text-xs"
             style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;">
          ❌ {error}
        </div>
      {/if}

      <div class="flex flex-col items-center gap-3 p-4 rounded-xl mb-4"
           style="background: var(--bg-card); border: 1px solid var(--border);">
        <img
          src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&data={encodeURIComponent(otpauthUri)}"
          alt="QR Code 2FA"
          class="w-40 h-40 rounded-lg bg-white p-2"
        />
        <div class="text-center w-full">
          <div class="text-[11px] mb-1" style="color: var(--text-muted);">Clé manuelle (Base32) :</div>
          <code class="block text-xs px-2 py-1.5 rounded select-all break-all font-mono"
                style="background: var(--bg-secondary); color: #a78bfa;">
            {totpSecret}
          </code>
        </div>
      </div>

      <form onsubmit={confirm2FA} class="space-y-3">
        <input
          type="text"
          required
          bind:value={totpCode}
          placeholder="Code à 6 chiffres (ex. 123456)"
          class="w-full px-3.5 py-2.5 rounded-lg text-center text-base font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500"
          style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          class="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
          style="background: var(--accent); color: white;"
        >
          {isSubmitting ? '⏳ Activation...' : '✅ Activer la 2FA'}
        </button>
        <a
          href="/"
          class="block w-full py-2 rounded-lg text-xs text-center"
          style="color: var(--text-muted);"
        >
          Passer pour l'instant (configurable plus tard dans ⚙️ Configuration) →
        </a>
      </form>
    {/if}
  </div>
</div>
