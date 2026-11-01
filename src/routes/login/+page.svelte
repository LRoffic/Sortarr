<script>
  import { onMount } from 'svelte';

  let username = $state('');
  let password = $state('');
  let isSubmitting = $state(false);
  let error = $state('');

  // Captcha state
  let captchaMode = $state('builtin'); // 'google' | 'builtin'
  let googleSiteKey = $state('');
  let captchaChecked = $state(false);
  let captchaToken = $state('');
  let captchaSvg = $state('');
  let captchaAnswer = $state('');
  let loadingCaptcha = $state(false);

  // 2FA state
  let step2FA = $state(false);
  let pendingToken = $state('');
  let totpCode = $state('');

  async function loadCaptcha() {
    loadingCaptcha = true;
    try {
      const res = await fetch('/api/auth/captcha');
      const data = await res.json();
      if (data.mode === 'google' && data.siteKey) {
        captchaMode = 'google';
        googleSiteKey = data.siteKey;
        if (typeof window !== 'undefined' && !document.getElementById('google-recaptcha-script')) {
          const s = document.createElement('script');
          s.id = 'google-recaptcha-script';
          s.src = 'https://www.google.com/recaptcha/api.js';
          s.async = true;
          s.defer = true;
          document.head.appendChild(s);
        }
      } else {
        captchaMode = 'builtin';
        captchaToken = data.token || '';
        captchaSvg = data.svg || '';
        captchaAnswer = '';
      }
    } catch (e) {
      error = e.message;
    } finally {
      loadingCaptcha = false;
    }
  }

  onMount(() => {
    loadCaptcha();
  });

  async function toggleBuiltinCheckbox() {
    captchaChecked = !captchaChecked;
    if (captchaChecked && !captchaSvg) {
      await loadCaptcha();
    }
  }

  async function handleLogin(event) {
    event?.preventDefault();
    error = '';

    let recaptchaToken = '';
    if (captchaMode === 'google') {
      recaptchaToken = window.grecaptcha?.getResponse?.() || '';
      if (!recaptchaToken) {
        error = 'Veuillez cocher la case Google reCAPTCHA ("Je ne suis pas un robot")';
        return;
      }
    } else {
      if (!captchaChecked) {
        error = 'Veuillez cocher la case "Je ne suis pas un robot"';
        return;
      }
      if (!captchaAnswer.trim()) {
        error = 'Veuillez recopier le code de sécurité affiché dans le captcha';
        return;
      }
    }

    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          recaptchaToken,
          captchaToken,
          captchaAnswer
        })
      });
      const data = await res.json();
      if (!data.ok) {
        error = data.error || 'Identifiants invalides';
        if (captchaMode === 'google') {
          window.grecaptcha?.reset?.();
        } else {
          await loadCaptcha();
        }
      } else if (data.requires2FA) {
        pendingToken = data.pendingToken;
        step2FA = true;
        totpCode = '';
      } else {
        window.location.href = '/';
      }
    } catch (e) {
      error = e.message;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleVerify2FA(event) {
    event?.preventDefault();
    error = '';
    if (!totpCode.trim()) {
      error = 'Veuillez saisir votre code 2FA à 6 chiffres';
      return;
    }
    isSubmitting = true;
    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingToken,
          code: totpCode.trim()
        })
      });
      const data = await res.json();
      if (!data.ok) {
        error = data.error || 'Code 2FA invalide';
      } else {
        window.location.href = '/';
      }
    } catch (e) {
      error = e.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Sortarr — Connexion</title>
</svelte:head>

<div class="max-w-md mx-auto mt-10">
  <div class="rounded-2xl p-6 shadow-xl" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div class="text-center mb-6">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl mx-auto mb-3"
           style="background: var(--accent); color: white;">
        {step2FA ? '🔐' : 'S'}
      </div>
      <h1 class="text-2xl font-bold">
        {step2FA ? 'Double authentification' : 'Connexion à Sortarr'}
      </h1>
      <p class="text-xs mt-1" style="color: var(--text-muted);">
        {step2FA
          ? "Saisissez le code à 6 chiffres généré par votre application d'authentification (ou un code de secours)."
          : 'Connectez-vous pour accéder aux indexeurs et à la configuration.'}
      </p>
    </div>

    {#if error}
      <div class="rounded-xl p-3 mb-4 text-xs"
           style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;">
        ❌ {error}
      </div>
    {/if}

    {#if !step2FA}
      <form onsubmit={handleLogin} class="space-y-4">
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
            placeholder="Votre identifiant"
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
            autocomplete="current-password"
            bind:value={password}
            placeholder="••••••••"
            class="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
          />
        </div>

        <!-- Protection reCAPTCHA -->
        {#if captchaMode === 'google' && googleSiteKey}
          <div class="flex justify-center pt-1">
            <div class="g-recaptcha" data-sitekey={googleSiteKey} data-theme="dark"></div>
          </div>
        {:else}
          <div class="rounded-xl p-3.5" style="background: var(--bg-card); border: 1px solid var(--border);">
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={captchaChecked}
                  onchange={toggleBuiltinCheckbox}
                  class="w-5 h-5 rounded accent-purple-600 cursor-pointer"
                />
                <span class="text-sm font-medium">Je ne suis pas un robot</span>
              </label>
              <div class="text-right">
                <div class="text-[10px] font-semibold uppercase tracking-wider" style="color: #a78bfa;">
                  🛡️ reCAPTCHA
                </div>
                <div class="text-[9px]" style="color: var(--text-muted);">
                  Protection Sortarr
                </div>
              </div>
            </div>

            {#if captchaChecked}
              <div class="mt-3 pt-3 space-y-2.5" style="border-top: 1px solid var(--border);">
                <div class="flex items-center justify-between gap-2">
                  <div class="overflow-hidden rounded-lg border" style="border-color: var(--border);">
                    {@html captchaSvg}
                  </div>
                  <button
                    type="button"
                    onclick={loadCaptcha}
                    disabled={loadingCaptcha}
                    title="Générer un nouveau code"
                    class="px-3 py-2 rounded-lg text-xs cursor-pointer"
                    style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
                  >
                    {loadingCaptcha ? '⏳' : '🔄 Autre code'}
                  </button>
                </div>
                <input
                  type="text"
                  bind:value={captchaAnswer}
                  placeholder="Recopiez les 5 caractères ci-dessus"
                  maxlength="8"
                  autocomplete="off"
                  class="w-full px-3 py-2 rounded-lg text-sm font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500"
                  style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
                />
              </div>
            {/if}
          </div>
        {/if}

        <button
          type="submit"
          disabled={isSubmitting}
          class="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity mt-2 cursor-pointer"
          style="background: var(--accent); color: white; opacity: {isSubmitting ? 0.6 : 1};"
        >
          {isSubmitting ? '⏳ Vérification...' : '🔓 Se connecter'}
        </button>
      </form>
    {:else}
      <!-- Étape 2 : Code 2FA -->
      <form onsubmit={handleVerify2FA} class="space-y-4">
        <div>
          <label class="block text-xs font-semibold mb-1.5" for="totpCode">
            📱 Code d'authentification (6 chiffres ou code de secours)
          </label>
          <input
            id="totpCode"
            type="text"
            required
            autofocus
            autocomplete="one-time-code"
            bind:value={totpCode}
            placeholder="123456"
            class="w-full px-3.5 py-2.5 rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500"
            style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          class="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity cursor-pointer"
          style="background: var(--accent); color: white; opacity: {isSubmitting ? 0.6 : 1};"
        >
          {isSubmitting ? '⏳ Vérification 2FA...' : '✅ Valider le code 2FA'}
        </button>

        <button
          type="button"
          onclick={() => {
            step2FA = false;
            pendingToken = '';
            error = '';
            loadCaptcha();
          }}
          class="w-full py-2 rounded-lg text-xs font-medium cursor-pointer"
          style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);"
        >
          ← Retour à la connexion
        </button>
      </form>
    {/if}
  </div>
</div>
