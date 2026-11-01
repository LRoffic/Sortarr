<script>
  import { untrack, onMount } from 'svelte';
  import { getTrackerLogo, getTrackerInitials } from '$lib/logos.js';

  let { data } = $props();
  let failedLogos = $state({});

  // Système de mise à jour GitHub Releases (https://github.com/LRoffic/Sortarr)
  let updateStatus = $state(null);
  let isCheckingUpdate = $state(false);
  let isInstallingUpdate = $state(false);
  let updateResult = $state(null);

  async function checkUpdates(force = false) {
    isCheckingUpdate = true;
    try {
      const res = await fetch(`/api/update${force ? '?force=1' : ''}`);
      updateStatus = await res.json();
    } catch (e) {
      updateStatus = { ok: false, error: e.message };
    } finally {
      isCheckingUpdate = false;
    }
  }

  async function installUpdate() {
    isInstallingUpdate = true;
    updateResult = null;
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error || 'Erreur lors de la mise à jour');
      updateResult = {
        ok: true,
        text: `Mise à jour v${r.installedVersion} (${r.tagName}) installée et compilée avec succès ! Redémarrez le serveur Node si vous êtes en mode production.`,
        logs: r.logs || []
      };
      if (r.status) updateStatus = r.status;
    } catch (e) {
      updateResult = { ok: false, text: e.message, logs: [] };
    } finally {
      isInstallingUpdate = false;
    }
  }

  onMount(() => {
    checkUpdates(false);
  });

  // untrack() prevents Svelte 5 from warning about capturing initial prop values in $state
  let prowlarrUrl = $state(untrack(() => data.config.prowlarrUrl ?? ''));
  let prowlarrApiKey = $state(untrack(() => data.config.prowlarrApiKey ?? ''));
  let autoRefreshInterval = $state(untrack(() => data.config.autoRefreshInterval ?? 20));
  let autoSortEnabled = $state(untrack(() => !!(data.config.autoSortEnabled)));
  let autoSortInterval = $state(untrack(() => data.config.autoSortInterval ?? 20));
  let apiRatioUrl = $state(untrack(() => data.config.apiRatioUrl ?? ''));
  let isTesting = $state(false);
  let testResult = $state(null);

  let isTestingApiRatio = $state(false);
  let apiRatioTestResult = $state(null);

  async function testApiRatio() {
    if (!apiRatioUrl || !apiRatioUrl.trim()) return;
    isTestingApiRatio = true;
    apiRatioTestResult = null;
    try {
      const res = await fetch('/api/test-api-ratio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiRatioUrl: apiRatioUrl.trim() })
      });
      apiRatioTestResult = await res.json();
    } catch (e) {
      apiRatioTestResult = { ok: false, error: e.message };
    } finally {
      isTestingApiRatio = false;
    }
  }

  let isSaving = $state(false);
  let saveResult = $state(null);

  // Sécurité : 2FA & reCAPTCHA
  let totpEnabled = $state(untrack(() => !!(data.security?.totpEnabled)));
  let backupCodesRemaining = $state(untrack(() => data.security?.backupCodesRemaining ?? 0));
  let recaptchaSiteKey = $state(untrack(() => data.security?.recaptchaSiteKey ?? ''));
  let recaptchaSecretKey = $state(untrack(() => (data.security?.recaptchaSecretKeySet ? '••••••••' : '')));
  let setupTotpSecret = $state('');
  let setupOtpauthUri = $state('');
  let confirmTotpCode = $state('');
  let disableTotpInput = $state('');
  let newBackupCodes = $state([]);
  let secMsg = $state(null);
  let secLoading = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmNewPassword = $state('');

  async function updatePassword() {
    secLoading = true;
    secMsg = null;
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-password',
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword
        })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      currentPassword = '';
      newPassword = '';
      confirmNewPassword = '';
      secMsg = { ok: true, text: 'Mot de passe modifié avec succès !' };
    } catch (e) {
      secMsg = { ok: false, text: e.message };
    } finally {
      secLoading = false;
    }
  }

  async function start2FASetup() {
    secLoading = true;
    secMsg = null;
    newBackupCodes = [];
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      setupTotpSecret = r.secret;
      setupOtpauthUri = r.otpauthUri;
    } catch (e) {
      secMsg = { ok: false, text: e.message };
    } finally {
      secLoading = false;
    }
  }

  async function confirm2FASetup() {
    secLoading = true;
    secMsg = null;
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code: confirmTotpCode })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      totpEnabled = true;
      backupCodesRemaining = r.security?.backupCodesRemaining ?? 6;
      newBackupCodes = r.backupCodes || [];
      setupTotpSecret = '';
      setupOtpauthUri = '';
      confirmTotpCode = '';
      secMsg = { ok: true, text: 'Double authentification (2FA) activée avec succès !' };
    } catch (e) {
      secMsg = { ok: false, text: e.message };
    } finally {
      secLoading = false;
    }
  }

  async function disable2FA() {
    secLoading = true;
    secMsg = null;
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', codeOrPassword: disableTotpInput })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      totpEnabled = false;
      backupCodesRemaining = 0;
      newBackupCodes = [];
      disableTotpInput = '';
      secMsg = { ok: true, text: 'Double authentification (2FA) désactivée.' };
    } catch (e) {
      secMsg = { ok: false, text: e.message };
    } finally {
      secLoading = false;
    }
  }

  async function saveRecaptcha() {
    secLoading = true;
    secMsg = null;
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-recaptcha',
          siteKey: recaptchaSiteKey,
          secretKey: recaptchaSecretKey
        })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      secMsg = {
        ok: true,
        text: recaptchaSiteKey.trim()
          ? 'Clés Google reCAPTCHA v2 enregistrées.'
          : 'Captcha visuel intégré Sortarr actif sur la page de connexion.'
      };
    } catch (e) {
      secMsg = { ok: false, text: e.message };
    } finally {
      secLoading = false;
    }
  }

  // Config par tracker (clé = id indexeur Prowlarr)
  const emptyTracker = () => ({
    enabled: false, type: 'unit3d', baseUrl: '', apiKey: '',
    freeleech: 'auto', manualUpGB: '', manualDownGB: '',
    authMode: 'bearer', apiRatioKey: '', pathUp: '', pathDown: '', pathRatio: '', pathPoints: '', pathFl: ''
  });
  function guessTypeByName(name, privacy) {
    if (privacy === 'public') return 'public';
    const n = String(name || '').toLowerCase();
    if (n.includes('tr4ker')) return 'tr4ker';
    if (n.includes('c411')) return 'c411';
    if (n.includes('draupnirr')) return 'draupnirr';
    if (n.includes('astra')) return 'astra';
    if (n.includes('crazy')) return 'crazyspirits';
    if (n.includes('nostradamus')) return 'nostradamus';
    if (n.includes('ygg')) return 'yggreborn';
    if (n.includes('v3x')) return 'v3x';
    if (n.includes('speedapp')) return 'speedapp';
    if (n.includes('teamflix')) return 'teamflix';
    return 'unit3d';
  }

  let trackers = $state(
    untrack(() => {
      const t = {};
      for (const idx of data.indexers ?? []) {
        const saved = data.config.trackers?.[idx.id];
        t[idx.id] = {
          ...emptyTracker(),
          type: guessTypeByName(idx.name, idx.privacy),
          ...(idx.privacy === 'public' && !saved ? { enabled: true, type: 'public' } : {}),
          ...(saved ?? {})
        };
      }
      return t;
    })
  );
  let trackerTests = $state({});
  let isDetecting = $state(false);
  let showDebugConsole = $state(false);
  let debugHistory = $state([]);
  let maskSecrets = $state(true);

  function maskValue(str) {
    if (!maskSecrets || !str) return str;
    return String(str)
      .replace(/([?&](?:api_?token|apikey|passkey)=)([^&\s]+)/gi, (_, p1, p2) =>
        `${p1}${p2.length > 8 ? `${p2.slice(0, 4)}…${p2.slice(-4)}` : '••••'}`
      )
      .replace(/(Bearer\s+)([^\s]+)/gi, (_, p1, p2) =>
        `${p1}${p2.length > 8 ? `${p2.slice(0, 4)}…${p2.slice(-4)}` : '••••'}`
      );
  }

  function formatHeadersForDebug(headers) {
    if (!headers || typeof headers !== 'object') return '{}';
    const copy = {};
    for (const [k, v] of Object.entries(headers)) {
      if (maskSecrets && /^(authorization|x-api-key|cookie)$/i.test(k) && typeof v === 'string') {
        copy[k] = v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-4)}` : '••••••••';
      } else {
        copy[k] = v;
      }
    }
    return JSON.stringify(copy, null, 2);
  }

  function fmtBytes(b) {
    if (b === null || b === undefined) return '—';
    const v = Math.abs(b);
    return v / 1024 ** 4 >= 1 ? `${(b / 1024 ** 4).toFixed(2)} To` : `${(b / 1024 ** 3).toFixed(1)} Go`;
  }

  async function testTracker(id) {
    trackerTests[id] = { loading: true };
    const idxObj = (data.indexers ?? []).find((x) => x.id === id);
    try {
      const res = await fetch('/api/tracker-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexerId: id, apiRatioUrl, tracker: $state.snapshot(trackers[id]) })
      });
      const r = await res.json();
      trackerTests[id] = r;
      debugHistory = [
        {
          uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: new Date().toLocaleTimeString('fr-FR'),
          indexerId: id,
          indexerName: r.indexerName || idxObj?.name || `Tracker #${id}`,
          connectorType: r.connectorType || trackers[id]?.type || 'unit3d',
          ok: r.ok,
          error: r.error || null,
          stats: r.stats || null,
          durationMs: r.durationMs ?? 0,
          debugLogs: Array.isArray(r.debugLogs) ? r.debugLogs : []
        },
        ...debugHistory
      ].slice(0, 30);
      return r;
    } catch (e) {
      trackerTests[id] = { ok: false, error: e.message };
      debugHistory = [
        {
          uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: new Date().toLocaleTimeString('fr-FR'),
          indexerId: id,
          indexerName: idxObj?.name || `Tracker #${id}`,
          connectorType: trackers[id]?.type || 'unit3d',
          ok: false,
          error: e.message,
          stats: null,
          durationMs: 0,
          debugLogs: []
        },
        ...debugHistory
      ].slice(0, 30);
      return trackerTests[id];
    }
  }

  // Essaie le connecteur UNIT3D avec l'URL/clé déjà connues de Prowlarr
  async function detectAll() {
    isDetecting = true;
    for (const idx of data.indexers ?? []) {
      if (idx.privacy === 'public') continue;
      const n = idx.name.toLowerCase();
      // 1) api-ratio si configuré, 2) connecteur direct adapté au nom
      let r = { ok: false };
      if (apiRatioUrl.trim()) {
        trackers[idx.id].type = 'apiratio';
        r = await testTracker(idx.id);
      }
      if (!r.ok) {
        trackers[idx.id].type =
          n.includes('tr4ker') ? 'tr4ker'
          : n.includes('c411') ? 'c411'
          : n.includes('draupnirr') ? 'draupnirr'
          : n.includes('astra') ? 'astra'
          : n.includes('crazy') ? 'crazyspirits'
          : n.includes('nostradamus') ? 'nostradamus'
          : n.includes('ygg') ? 'yggreborn'
          : n.includes('v3x') ? 'v3x'
          : n.includes('speedapp') ? 'speedapp'
          : n.includes('teamflix') ? 'teamflix'
          : 'unit3d';
        r = await testTracker(idx.id);
      }
      if (r.ok) trackers[idx.id].enabled = true;
    }
    isDetecting = false;
  }

  // Sauvegarde via fetch JSON (évite la protection CSRF des formulaires SvelteKit
  // qui bloque les POST quand l'origine diffère, ex. accès via IP / reverse proxy)
  async function saveSettings(event) {
    event?.preventDefault();
    isSaving = true;
    saveResult = null;
    try {
      const res = await fetch('/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prowlarrUrl,
          prowlarrApiKey,
          autoRefreshInterval,
          autoSortEnabled,
          autoSortInterval,
          apiRatioUrl,
          trackers: $state.snapshot(trackers)
        })
      });
      saveResult = await res.json();
    } catch (e) {
      saveResult = { ok: false, error: e.message };
    } finally {
      isSaving = false;
    }
  }

  async function testConnection() {
    isTesting = true;
    testResult = null;
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prowlarrUrl, prowlarrApiKey })
      });
      const result = await res.json();
      testResult = result;
    } catch (e) {
      testResult = { ok: false, error: e.message };
    } finally {
      isTesting = false;
    }
  }
</script>

<svelte:head>
  <title>Sortarr — Configuration</title>
</svelte:head>

<div class="max-w-xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Configuration</h1>
  <p class="text-sm mb-8" style="color: var(--text-muted);">
    Paramètres de connexion à votre instance Prowlarr.
  </p>

  <!-- Connection status card -->
  {#if saveResult?.ok}
    <div class="rounded-xl p-4 mb-6 text-sm"
         style="background: {saveResult.connectionOk ? '#22c55e22' : '#f9731622'}; border: 1px solid {saveResult.connectionOk ? '#22c55e' : '#f97316'}; color: {saveResult.connectionOk ? '#4ade80' : '#fb923c'};">
      {#if saveResult.connectionOk}
        ✅ Configuration sauvegardée — Prowlarr v{saveResult.version} connecté avec succès
      {:else}
        ⚠️ Configuration sauvegardée mais connexion échouée: {saveResult.testError}
      {/if}
    </div>
  {:else if saveResult}
    <div class="rounded-xl p-4 mb-6 text-sm"
         style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;">
      ❌ {saveResult.error}
    </div>
  {/if}

  <form onsubmit={saveSettings} class="space-y-6">
    <!-- Prowlarr URL -->
    <div>
      <label class="block text-sm font-semibold mb-2" for="prowlarrUrl">
        🌐 URL de Prowlarr
      </label>
      <input
        id="prowlarrUrl"
        name="prowlarrUrl"
        type="text"
        bind:value={prowlarrUrl}
        placeholder="http://localhost:9696"
        class="w-full px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
      />
      <p class="text-xs mt-1" style="color: var(--text-muted);">
        Ex: http://192.168.1.100:9696 ou https://prowlarr.mondomaine.com
      </p>
    </div>

    <!-- API Key -->
    <div>
      <label class="block text-sm font-semibold mb-2" for="prowlarrApiKey">
        🔑 Clé API Prowlarr
      </label>
      <div class="relative">
        <input
          id="prowlarrApiKey"
          name="prowlarrApiKey"
          type="text"
          bind:value={prowlarrApiKey}
          placeholder="Votre clé API (Settings → General → Security)"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
          style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
        />
      </div>
      <p class="text-xs mt-1" style="color: var(--text-muted);">
        Trouvez votre clé dans Prowlarr → Settings → General → Security → API Key
      </p>

      <!-- Bouton de test de connexion Prowlarr remonté sous l'input -->
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          onclick={testConnection}
          disabled={isTesting || !prowlarrUrl || !prowlarrApiKey}
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-2"
          style="background: {isTesting ? 'var(--bg-secondary)' : '#7c3aed22'}; border: 1px solid {isTesting ? 'var(--border)' : '#7c3aed66'}; color: {isTesting ? 'var(--text-muted)' : '#c4b5fd'};"
        >
          {isTesting ? '⏳ Test en cours...' : '🔌 Tester la connexion Prowlarr'}
        </button>
      </div>

      <!-- Résultat en direct du test Prowlarr -->
      {#if testResult}
        <div
          class="rounded-xl p-3.5 mt-3 text-sm flex items-center justify-between gap-2"
          style="background: {testResult.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {testResult.ok ? '#22c55e' : '#ef4444'}; color: {testResult.ok ? '#4ade80' : '#f87171'};"
        >
          <div>
            {#if testResult.ok}
              ✅ Connexion réussie à Prowlarr — version {testResult.version}
            {:else}
              ❌ Échec de la connexion : {testResult.error}
            {/if}
          </div>
          <button
            type="button"
            onclick={() => (testResult = null)}
            class="text-xs opacity-70 hover:opacity-100 cursor-pointer px-1"
            title="Masquer le message"
          >
            ✕
          </button>
        </div>
      {/if}
    </div>

    <!-- ── Auto-tri automatique ── -->
    <div class="rounded-xl p-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-sm font-semibold">✨ Auto-tri en arrière-plan</div>
          <div class="text-xs mt-0.5" style="color: var(--text-muted);">
            Applique automatiquement le tri (freeleech → ratio) sur Prowlarr même sans être connecté
          </div>
        </div>
        <!-- Toggle switch -->
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" name="autoSortEnabled" bind:checked={autoSortEnabled} class="sr-only peer" value="true" />
          <div class="w-11 h-6 rounded-full peer transition-colors"
               style="background: {autoSortEnabled ? 'var(--accent)' : 'var(--border)'};">
            <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                 style="transform: translateX({autoSortEnabled ? '20px' : '0px'});"></div>
          </div>
        </label>
      </div>

      {#if autoSortEnabled}
        <div class="mt-3 pt-3" style="border-top: 1px solid var(--border);">
          <label class="block text-xs font-medium mb-1.5" for="autoSortInterval" style="color: var(--text-muted);">
            Intervalle d'exécution (minutes)
          </label>
          <div class="flex items-center gap-3">
            <input
              id="autoSortInterval"
              name="autoSortInterval"
              type="number"
              min="5"
              max="1440"
              bind:value={autoSortInterval}
              class="w-28 px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
            />
            <span class="text-xs" style="color: var(--text-muted);">
              Prochain passage : dans ~{autoSortInterval} min
            </span>
          </div>
          <p class="text-xs mt-2" style="color: var(--text-muted);">
            ⚠️ Nécessite que Sortarr soit démarré (node build/index.js). Le planificateur tourne côté serveur.
          </p>
        </div>
      {/if}
    </div>

    <!-- ── Trackers : stats réelles (ratio / buffer / freeleech) ── -->
    <div class="rounded-xl p-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap sm:flex-nowrap">
        <div>
          <div class="text-sm font-semibold">📊 Trackers (ratio, buffer, freeleech)</div>
          <div class="text-xs mt-0.5" style="color: var(--text-muted);">
            Prowlarr n'expose pas votre ratio : Sortarr interroge directement chaque tracker (API UNIT3D <code>/api/user</code>) ou utilise une saisie manuelle.
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={() => { showDebugConsole = !showDebugConsole; }}
            title="Afficher ou masquer la console de débogage des requêtes HTTP lors du test des trackers"
            class="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
            style="background: {showDebugConsole ? '#22c55e22' : 'var(--bg-card)'}; border: 1px solid {showDebugConsole ? '#22c55e66' : 'var(--border)'}; color: {showDebugConsole ? '#4ade80' : 'var(--text-muted)'};"
          >
            🛠️ Console debug {debugHistory.length > 0 ? `(${debugHistory.length})` : ''}
          </button>
          <button type="button" onclick={detectAll} disabled={isDetecting || !data.indexers?.length}
                  class="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer"
                  style="background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa;">
            {isDetecting ? '⏳ Détection...' : '🔎 Détecter automatiquement'}
          </button>
        </div>
      </div>

      <!-- Console de débogage optionnelle -->
      {#if showDebugConsole}
        <div class="mb-4 rounded-xl overflow-hidden" style="background: #090d16; border: 1px solid #334155;">
          <div class="flex items-center justify-between px-3.5 py-2.5 flex-wrap gap-2"
               style="background: #0f172a; border-bottom: 1px solid #1e293b;">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full inline-block" style="background: #22c55e;"></span>
              <span class="text-xs font-mono font-bold" style="color: #e2e8f0;">
                Console de débogage HTTP (Tests des Trackers)
              </span>
              <span class="text-[11px] font-mono px-1.5 py-0.5 rounded" style="background: #1e293b; color: #94a3b8;">
                {debugHistory.length} test(s)
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={() => { maskSecrets = !maskSecrets; }}
                class="text-[11px] font-mono px-2 py-1 rounded cursor-pointer"
                style="background: #1e293b; color: {maskSecrets ? '#94a3b8' : '#fbbf24'}; border: 1px solid #334155;"
                title="Afficher ou masquer les clés API et cookies dans la console"
              >
                {maskSecrets ? '🔒 Clés masquées' : '🔓 Clés visibles'}
              </button>
              {#if debugHistory.length > 0}
                <button
                  type="button"
                  onclick={() => { debugHistory = []; }}
                  class="text-[11px] font-mono px-2 py-1 rounded cursor-pointer"
                  style="background: #1e293b; color: #f87171; border: 1px solid #334155;"
                >
                  🗑️ Vider
                </button>
              {/if}
              <button
                type="button"
                onclick={() => { showDebugConsole = false; }}
                class="text-[11px] font-mono px-2 py-1 rounded cursor-pointer"
                style="background: #1e293b; color: #cbd5e1; border: 1px solid #334155;"
              >
                ✕ Fermer
              </button>
            </div>
          </div>

          <div class="p-3 max-h-96 overflow-y-auto space-y-2.5 font-mono text-xs">
            {#if debugHistory.length === 0}
              <div class="text-center py-6" style="color: #64748b;">
                Aucune requête enregistrée pour le moment.<br />
                Cliquez sur <strong>« 🔌 Tester »</strong> sur un tracker ci-dessous pour inspecter les requêtes exécutées et leurs réponses.
              </div>
            {:else}
              {#each debugHistory as item (item.uid)}
                <div class="rounded-lg p-2.5 space-y-2" style="background: #0f172a; border: 1px solid {item.ok ? '#14532d' : '#7f1d1d'};">
                  <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style="background: {item.ok ? '#22c55e22' : '#ef444422'}; color: {item.ok ? '#4ade80' : '#f87171'};">
                        {item.ok ? 'OK' : 'ERREUR'}
                      </span>
                      <span class="font-bold" style="color: #f8fafc;">{item.indexerName}</span>
                      <span class="px-1.5 py-0.5 rounded text-[10px]" style="background: #1e293b; color: #a78bfa;">
                        type: {item.connectorType}
                      </span>
                    </div>
                    <div class="text-[11px]" style="color: #64748b;">
                      {item.time} • {item.durationMs} ms • {item.debugLogs.length} requête(s)
                    </div>
                  </div>

                  {#if item.error}
                    <div class="px-2 py-1 rounded text-[11px]" style="background: #450a0a; color: #fca5a5;">
                      ❌ {item.error}
                    </div>
                  {/if}

                  {#if item.debugLogs.length > 0}
                    <div class="space-y-1.5">
                      {#each item.debugLogs as req, rIdx}
                        <div class="rounded p-2" style="background: #090d16; border: 1px solid #1e293b;">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold"
                                  style="background: #3b82f622; color: #60a5fa;">
                              {req.method}
                            </span>
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold"
                                  style="background: {req.status >= 200 && req.status < 300 ? '#22c55e22' : req.status >= 300 && req.status < 400 ? '#f59e0b22' : '#ef444422'};
                                         color: {req.status >= 200 && req.status < 300 ? '#4ade80' : req.status >= 300 && req.status < 400 ? '#fbbf24' : '#f87171'};">
                              HTTP {req.status}
                            </span>
                            {#if req.tlsFallback}
                              <span class="px-1.5 py-0.2 rounded text-[10px]"
                                    style="background: #eab30822; color: #fde047;"
                                    title="Requête passée via le fallback TLS tolérant aux chaînes SSL incomplètes">
                                TLS Fallback
                              </span>
                            {/if}
                            <span class="text-[11px]" style="color: #64748b;">{req.durationMs} ms</span>
                            <span class="text-[11px] break-all" style="color: #cbd5e1;">
                              {maskValue(req.url)}
                            </span>
                          </div>

                          <div class="flex flex-col gap-1 mt-1.5">
                            <details class="group">
                              <summary class="cursor-pointer text-[11px] select-none" style="color: #94a3b8;">
                                ▸ En-têtes envoyés (Headers)
                              </summary>
                              <pre class="mt-1 p-2 rounded overflow-x-auto text-[11px]"
                                   style="background: #020617; color: #93c5fd; border: 1px solid #1e293b;">{formatHeadersForDebug(req.requestHeaders)}</pre>
                            </details>

                            <details class="group" open={!item.ok || rIdx === item.debugLogs.length - 1}>
                              <summary class="cursor-pointer text-[11px] select-none" style="color: #94a3b8;">
                                ▸ Réponse brute reçue ({req.responsePreview ? `${req.responsePreview.length} car.` : 'vide'})
                              </summary>
                              <pre class="mt-1 p-2 rounded overflow-x-auto max-h-56 text-[11px] whitespace-pre-wrap break-all"
                                   style="background: #020617; color: #a7f3d0; border: 1px solid #1e293b;">{req.responsePreview || '(aucun corps de réponse)'}</pre>
                            </details>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if item.stats}
                    <details class="group">
                      <summary class="cursor-pointer text-[11px] select-none" style="color: #a78bfa;">
                        ▸ Données extraites et normalisées par Sortarr (stats)
                      </summary>
                      <pre class="mt-1 p-2 rounded overflow-x-auto text-[11px]"
                           style="background: #090d16; color: #d8b4fe; border: 1px solid #1e293b;">{JSON.stringify(item.stats, null, 2)}</pre>
                    </details>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      {#if data.indexersError}
        <p class="text-xs" style="color: #f87171;">❌ Impossible de lister les indexeurs : {data.indexersError}</p>
      {:else if !data.indexers?.length}
        <p class="text-xs" style="color: var(--text-muted);">Sauvegardez d'abord l'URL et la clé API Prowlarr, puis rechargez la page.</p>
      {/if}

      <div class="mb-3 p-3.5 rounded-xl space-y-2.5" style="background: var(--bg-card); border: 1px solid var(--border);">
        <label class="block text-xs font-semibold" for="apiRatioUrl">
          🐳 URL du service <code>api-ratio</code> (optionnel — <a href="https://github.com/kreezx/api-ratio" target="_blank" class="underline" style="color: #a78bfa;">kreezx/api-ratio</a>)
        </label>
        <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <input
            id="apiRatioUrl"
            type="text"
            bind:value={apiRatioUrl}
            placeholder="http://localhost:8679"
            class="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-xs font-mono"
            style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
          />
          <button
            type="button"
            onclick={testApiRatio}
            disabled={isTestingApiRatio || !apiRatioUrl.trim()}
            class="px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0"
            style="background: {isTestingApiRatio ? 'var(--bg-secondary)' : '#0284c722'}; border: 1px solid {isTestingApiRatio ? 'var(--border)' : '#0284c766'}; color: {isTestingApiRatio ? 'var(--text-muted)' : '#7dd3fc'};"
          >
            {isTestingApiRatio ? '⏳ Test en cours...' : '🔌 Valider l\'URL api-ratio'}
          </button>
        </div>

        {#if apiRatioTestResult}
          <div
            class="rounded-lg p-3 text-xs flex items-start justify-between gap-2"
            style="background: {apiRatioTestResult.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {apiRatioTestResult.ok ? '#22c55e' : '#ef4444'}; color: {apiRatioTestResult.ok ? '#4ade80' : '#f87171'};"
          >
            <div>
              {#if apiRatioTestResult.ok}
                <div>
                  ✅ Connexion réussie à <strong>api-ratio</strong> ({apiRatioTestResult.url})
                </div>
                <div class="mt-1 text-[11px]" style="color: #86efac;">
                  {apiRatioTestResult.count} tracker{apiRatioTestResult.count > 1 ? 's' : ''} disponible{apiRatioTestResult.count > 1 ? 's' : ''} :
                  <span class="font-mono font-bold text-white ml-1">
                    {apiRatioTestResult.trackers?.join(', ') || 'aucun tracker retourné'}
                  </span>
                </div>
              {:else}
                <div>❌ Impossible de contacter api-ratio : {apiRatioTestResult.error}</div>
              {/if}
            </div>
            <button
              type="button"
              onclick={() => (apiRatioTestResult = null)}
              class="text-xs opacity-70 hover:opacity-100 cursor-pointer px-1 shrink-0"
              title="Masquer le message"
            >
              ✕
            </button>
          </div>
        {/if}

        <p class="text-xs" style="color: var(--text-muted);">
          Centralise C411, TR4KER, Gemini/G3MINI, Crazy Spirits, Nostradamus, La Cale, Memphis, The Old School, Generation Free, HD-Space, NEXUM, Redacted via <code>GET /ratios</code>. N'expose pas le freeleech (réglez-le manuellement ci-dessous).
        </p>
      </div>

      <div class="space-y-3">
        {#each data.indexers ?? [] as idx (idx.id)}
          {@const t = trackers[idx.id]}
          {@const test = trackerTests[idx.id]}
          {@const logoUrl = getTrackerLogo(idx)}
          <div class="rounded-lg p-3" style="background: var(--bg-card); border: 1px solid var(--border);">
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                <input type="checkbox" bind:checked={t.enabled} />
                <span class="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                      style="background: #0b0f19; border: 1px solid var(--border);">
                  {#if logoUrl && !failedLogos[idx.id]}
                    <img
                      src={logoUrl}
                      alt={idx.name}
                      class="w-5 h-5 object-contain"
                      onerror={() => { failedLogos[idx.id] = true; }}
                    />
                  {:else}
                    <span class="text-[10px] font-bold" style="color: #a78bfa;">
                      {getTrackerInitials(idx.name)}
                    </span>
                  {/if}
                </span>
                {idx.name}
                <span class="text-xs" style="color: var(--text-muted);">
                  ({idx.privacy === 'private' ? 'Privé' : idx.privacy === 'semiPrivate' ? 'Semi-privé' : 'Public'})
                </span>
              </label>
              <button type="button" onclick={() => testTracker(idx.id)}
                      class="text-xs px-2 py-1 rounded"
                      style="border: 1px solid var(--border); color: #e2e8f0;">
                {test?.loading ? '⏳' : '🔌 Tester'}
              </button>
            </div>

            {#if t.enabled}
              <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
                <select bind:value={t.type} class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;">
                  <option value="apiratio">Service api-ratio (/ratios)</option>
                  <option value="unit3d">API UNIT3D (/api/user)</option>
                  <option value="tr4ker">API TR4KER directe (/api/me)</option>
                  <option value="draupnirr">API Draupnirr directe (/api/me)</option>
                  <option value="astra">API AstraTorrent directe (/api/user.php)</option>
                  <option value="speedapp">API SpeedApp directe (/api/me)</option>
                  <option value="teamflix">API TeamFlix directe (/api/user)</option>
                  <option value="c411">API C411 directe (/api/user/profile)</option>
                  <option value="v3x">API V3X directe (api.v3x.club/api/me)</option>
                  <option value="crazyspirits">Crazy Spirits (cookie uid/pass ou api-ratio)</option>
                  <option value="nostradamus">Nostradamus (cookie session ou api-ratio)</option>
                  <option value="yggreborn">YggReborn (cookie /account ou exporter /metrics)</option>
                  <option value="custom">JSON personnalisé</option>
                  <option value="manual">Saisie manuelle</option>
                  <option value="public">Tracker public (pas de ratio)</option>
                </select>
                <select bind:value={t.freeleech} class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;">
                  <option value="auto">Freeleech : auto (API)</option>
                  <option value="on">Freeleech : toujours actif</option>
                  <option value="off">Freeleech : jamais</option>
                </select>
                {#if t.type === 'apiratio'}
                  <input type="text" bind:value={t.apiRatioKey}
                         placeholder="Clé dans /ratios (vide = auto : tr4ker, c411, gemini, crazyspirits, nostradamus…)"
                         class="px-2 py-1.5 rounded font-mono col-span-2"
                         style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                {:else if ['unit3d', 'tr4ker', 'draupnirr', 'astra', 'speedapp', 'teamflix', 'c411', 'v3x', 'crazyspirits', 'nostradamus', 'yggreborn', 'custom'].includes(t.type)}
                  <input type="text" bind:value={t.baseUrl}
                         placeholder={
                           t.type === 'custom' ? 'URL complète de l\u2019endpoint profil (JSON)'
                           : t.type === 'yggreborn' ? 'URL exporter /metrics ou URL du tracker (optionnel)'
                           : t.type === 'v3x' ? 'Optionnel (défaut : https://api.v3x.club/api/me)'
                           : 'URL du tracker (vide = défaut / celle de Prowlarr)'
                         }
                         class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.apiKey}
                         placeholder={
                           t.type === 'crazyspirits' ? 'Cookie : uid=...; pass=...'
                           : t.type === 'nostradamus' ? 'Cookie : _nostradamus_key=...'
                           : t.type === 'yggreborn' ? 'Cookie : __ygg_sess=...; cf_clearance=... (ou vide si exporter)'
                           : t.type === 'v3x' ? 'Clé API V3X (« Mon profil » ou Torznab)'
                           : t.type === 'speedapp' ? 'Token API (speedapp.io/profile/api-tokens) ou email:motdepasse'
                           : t.type === 'teamflix' ? 'Clé API TeamFlix (My Settings → API Key)'
                           : 'Clé API (vide = celle de Prowlarr)'
                         }
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  {#if t.type === 'custom'}
                    <select bind:value={t.authMode} class="px-2 py-1.5 rounded col-span-2" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;">
                      <option value="bearer">Auth : Authorization: Bearer</option>
                      <option value="xapikey">Auth : en-tête X-Api-Key</option>
                      <option value="apikey">Auth : paramètre ?apikey=</option>
                      <option value="api_token">Auth : paramètre ?api_token=</option>
                    </select>
                    {#each [['pathUp', 'Chemin upload (ex. transfer.uploaded.total)'], ['pathDown', 'Chemin download'], ['pathRatio', 'Chemin ratio (optionnel)'], ['pathPoints', 'Chemin points (optionnel)'], ['pathFl', 'Chemin freeleech booléen (optionnel)']] as [key, label]}
                      <input type="text" bind:value={t[key]} placeholder={label}
                             class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                    {/each}
                  {/if}
                {:else if t.type === 'manual'}
                  <input type="number" step="any" bind:value={t.manualUpGB} placeholder="Upload (Go)"
                         class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="number" step="any" bind:value={t.manualDownGB} placeholder="Download (Go)"
                         class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                {/if}
              </div>
            {/if}

            {#if test && !test.loading}
              <div class="mt-2 flex items-center justify-between gap-2 flex-wrap text-xs" style="color: {test.ok ? '#4ade80' : '#f87171'};">
                <div>
                  {#if test.ok && test.stats.public}
                    ✅ Tracker public — aucun ratio géré
                  {:else if test.ok}
                    ✅ Ratio {test.stats.infinite ? '∞' : (test.stats.ratio?.toFixed(2) ?? '—')} • ↑ {fmtBytes(test.stats.uploaded)} • ↓ {fmtBytes(test.stats.downloaded)} • Buffer {fmtBytes(test.stats.buffer)} • {test.stats.pointsLabel || 'Points'} : {test.stats.points !== null && test.stats.points !== undefined ? Math.round(test.stats.points).toLocaleString('fr-FR') : '—'} • 🌱 Seeds : {test.stats.seeding !== null && test.stats.seeding !== undefined ? test.stats.seeding : '—'} • FL : {test.stats.freeleech === null ? 'non détecté' : test.stats.freeleech ? 'oui' : 'non'}
                  {:else}
                    ❌ {test.error}
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => { showDebugConsole = true; }}
                  class="text-[11px] px-2 py-0.5 rounded font-mono cursor-pointer shrink-0"
                  style="background: #1e293b; color: #94a3b8; border: 1px solid #334155;"
                  title="Ouvrir la console de débogage pour voir la requête HTTP et la réponse brute"
                >
                  🔍 Voir requête / réponse
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Action buttons -->
    <div class="pt-2">
      <button
        type="submit"
        disabled={isSaving}
        class="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer shadow-lg"
        style="background: var(--accent); color: white; opacity: {isSaving ? 0.6 : 1};"
      >
        {isSaving ? '⏳ Sauvegarde en cours...' : '💾 Sauvegarder les paramètres'}
      </button>
    </div>
  </form>

  <!-- Last auto-sort info -->


  <!-- Sécurité : Mot de passe, 2FA & reCAPTCHA -->
  <div class="mt-8 rounded-xl p-4 space-y-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div>
      <h3 class="text-sm font-semibold">🔐 Sécurité : Mot de passe, 2FA &amp; reCAPTCHA</h3>
      <p class="text-xs mt-0.5" style="color: var(--text-muted);">
        Modifiez votre mot de passe et protégez l'accès à votre instance Sortarr avec la double authentification (2FA) et reCAPTCHA.
      </p>
    </div>

    {#if secMsg}
      <div class="rounded-lg p-3 text-xs"
           style="background: {secMsg.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {secMsg.ok ? '#22c55e' : '#ef4444'}; color: {secMsg.ok ? '#4ade80' : '#f87171'};">
        {secMsg.ok ? '✅' : '❌'} {secMsg.text}
      </div>
    {/if}

    <!-- Bloc Modification du mot de passe -->
    <div class="rounded-lg p-3 space-y-2.5" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="text-xs font-semibold">🔑 Modifier le mot de passe</div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <input
          type="password"
          bind:value={currentPassword}
          placeholder="Mot de passe actuel"
          autocomplete="current-password"
          class="px-2.5 py-1.5 rounded"
          style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
        />
        <input
          type="password"
          bind:value={newPassword}
          placeholder="Nouveau mot de passe (min. 4 car.)"
          autocomplete="new-password"
          class="px-2.5 py-1.5 rounded"
          style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
        />
        <input
          type="password"
          bind:value={confirmNewPassword}
          placeholder="Confirmer le nouveau mot de passe"
          autocomplete="new-password"
          class="px-2.5 py-1.5 rounded"
          style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
        />
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          onclick={updatePassword}
          disabled={secLoading || !currentPassword || !newPassword || !confirmNewPassword}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style="background: var(--accent); color: white; opacity: {(secLoading || !currentPassword || !newPassword || !confirmNewPassword) ? 0.5 : 1};"
        >
          Modifier le mot de passe
        </button>
      </div>
    </div>

    <!-- Bloc 2FA -->
    <div class="rounded-lg p-3 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs font-semibold">📱 Double authentification (TOTP 2FA)</div>
          <div class="text-[11px]" style="color: var(--text-muted);">
            Statut :
            {#if totpEnabled}
              <span style="color: #4ade80; font-weight: 600;">Activée ({backupCodesRemaining} codes de secours restants)</span>
            {:else}
              <span style="color: #fb923c;">Désactivée</span>
            {/if}
          </div>
        </div>
        {#if !totpEnabled && !setupTotpSecret}
          <button
            type="button"
            onclick={start2FASetup}
            disabled={secLoading}
            class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style="background: var(--accent); color: white;"
          >
            Activer la 2FA
          </button>
        {/if}
      </div>

      {#if setupTotpSecret}
        <div class="pt-3 space-y-3" style="border-top: 1px solid var(--border);">
          <div class="flex flex-col sm:flex-row items-center gap-4">
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={encodeURIComponent(setupOtpauthUri)}"
              alt="QR Code 2FA"
              class="w-36 h-36 rounded-lg bg-white p-2 shrink-0"
            />
            <div class="space-y-2 text-xs flex-1 min-w-0">
              <p style="color: var(--text-muted);">
                1. Scannez ce QR Code dans votre application 2FA ou saisissez cette clé Base32 :
              </p>
              <code class="block px-2.5 py-1.5 rounded font-mono break-all select-all"
                    style="background: var(--bg-secondary); color: #a78bfa;">
                {setupTotpSecret}
              </code>
              <p style="color: var(--text-muted);">
                2. Entrez le code à 6 chiffres généré pour valider :
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={confirmTotpCode}
                  placeholder="123456"
                  class="px-3 py-1.5 rounded text-xs font-mono tracking-widest flex-1"
                  style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
                />
                <button
                  type="button"
                  onclick={confirm2FASetup}
                  disabled={secLoading || !confirmTotpCode.trim()}
                  class="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                  style="background: #22c55e; color: #052e16;"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if newBackupCodes.length > 0}
        <div class="p-3 rounded-lg space-y-2" style="background: var(--bg-secondary); border: 1px solid #a78bfa55;">
          <div class="text-xs font-semibold" style="color: #a78bfa;">
            🔑 Codes de secours à usage unique (notez-les en lieu sûr) :
          </div>
          <div class="grid grid-cols-3 gap-2 font-mono text-xs text-center">
            {#each newBackupCodes as c}
              <div class="py-1 px-2 rounded" style="background: var(--bg-card); color: #e2e8f0;">{c}</div>
            {/each}
          </div>
        </div>
      {/if}

      {#if totpEnabled}
        <div class="pt-2 flex items-center gap-2" style="border-top: 1px solid var(--border);">
          <input
            type="password"
            bind:value={disableTotpInput}
            placeholder="Code 2FA ou mot de passe pour désactiver"
            class="px-3 py-1.5 rounded text-xs flex-1"
            style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
          />
          <button
            type="button"
            onclick={disable2FA}
            disabled={secLoading || !disableTotpInput.trim()}
            class="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
            style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;"
          >
            Désactiver la 2FA
          </button>
        </div>
      {/if}
    </div>

    <!-- Bloc reCAPTCHA -->
    <div class="rounded-lg p-3 space-y-2.5" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="text-xs font-semibold">🛡️ Protection reCAPTCHA sur la page de connexion</div>
      <p class="text-[11px]" style="color: var(--text-muted);">
        Par défaut, un widget reCAPTCHA visuel intégré protège la page <code>/login</code> sans clé externe. Pour utiliser <strong>Google reCAPTCHA v2 ("Je ne suis pas un robot")</strong>, renseignez vos clés ci-dessous :
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <input
          type="text"
          bind:value={recaptchaSiteKey}
          placeholder="Google reCAPTCHA Site Key (optionnel)"
          class="px-2.5 py-1.5 rounded font-mono"
          style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
        />
        <input
          type="password"
          bind:value={recaptchaSecretKey}
          placeholder="Google reCAPTCHA Secret Key (optionnel)"
          class="px-2.5 py-1.5 rounded font-mono"
          style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;"
        />
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          onclick={saveRecaptcha}
          disabled={secLoading}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style="background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa;"
        >
          Enregistrer reCAPTCHA
        </button>
      </div>
    </div>
  </div>

  <!-- Système de mise à jour (GitHub Releases : LRoffic/Sortarr) -->
  <div id="update" class="mt-8 rounded-xl p-4 space-y-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h3 class="text-sm font-semibold">🔄 Mise à jour automatique (GitHub Releases)</h3>
        <p class="text-xs mt-0.5" style="color: var(--text-muted);">
          Vérifie et installe les nouvelles versions depuis
          <a href="https://github.com/LRoffic/Sortarr/releases" target="_blank" class="underline" style="color: #a78bfa;">
            github.com/LRoffic/Sortarr
          </a>
          tout en préservant vos données (<code>data/</code>).
        </p>
      </div>
      <button
        type="button"
        onclick={() => checkUpdates(true)}
        disabled={isCheckingUpdate || isInstallingUpdate}
        class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
        style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
      >
        {isCheckingUpdate ? '⏳ Vérification...' : '🔍 Vérifier les mises à jour'}
      </button>
    </div>

    {#if updateStatus}
      <div class="rounded-lg p-3 space-y-3 text-xs" style="background: var(--bg-card); border: 1px solid var(--border);">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-3 flex-wrap">
            <div>
              <span style="color: var(--text-muted);">Version installée :</span>
              <span class="font-mono font-bold ml-1 px-2 py-0.5 rounded" style="background: #7c3aed22; color: #a78bfa;">
                v{updateStatus.currentVersion || '1.0.0'}
              </span>
            </div>
            <div>
              <span style="color: var(--text-muted);">Dernière release GitHub :</span>
              {#if updateStatus.noReleasesYet}
                <span class="font-mono ml-1 px-2 py-0.5 rounded" style="background: #1e293b; color: #94a3b8;">
                  Aucune release publiée
                </span>
              {:else}
                <span class="font-mono font-bold ml-1 px-2 py-0.5 rounded"
                      style="background: {updateStatus.updateAvailable ? '#22c55e22' : '#1e293b'}; color: {updateStatus.updateAvailable ? '#4ade80' : '#cbd5e1'};">
                  {updateStatus.tagName || `v${updateStatus.latestVersion}`}
                </span>
              {/if}
            </div>
          </div>

          {#if updateStatus.updateAvailable}
            <span class="px-2 py-0.5 rounded font-semibold" style="background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44;">
              ✨ Nouvelle version disponible !
            </span>
          {:else if updateStatus.ok}
            <span class="px-2 py-0.5 rounded font-medium" style="background: #1e293b; color: #94a3b8;">
              ✅ Vous êtes à jour
            </span>
          {/if}
        </div>

        {#if !updateStatus.ok && updateStatus.error}
          <div class="p-2.5 rounded" style="background: #ef444422; border: 1px solid #ef4444; color: #f87171;">
            ❌ {updateStatus.error}
          </div>
        {/if}

        {#if updateStatus.releaseNotes && !updateStatus.noReleasesYet}
          <div class="space-y-1">
            <div class="text-[11px] font-semibold" style="color: var(--text-muted);">
              📋 Notes de version ({updateStatus.releaseName || updateStatus.tagName}) :
            </div>
            <pre class="p-2.5 rounded text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto"
                 style="background: var(--bg-secondary); color: #cbd5e1; border: 1px solid var(--border);">{updateStatus.releaseNotes}</pre>
          </div>
        {/if}

        {#if updateStatus.updateAvailable}
          <div class="flex items-center justify-between pt-2 flex-wrap gap-2" style="border-top: 1px solid var(--border);">
            <a href={updateStatus.htmlUrl} target="_blank" class="underline text-[11px]" style="color: #a78bfa;">
              Voir la release sur GitHub ↗
            </a>
            <button
              type="button"
              onclick={installUpdate}
              disabled={isInstallingUpdate}
              class="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              style="background: #22c55e; color: #052e16; opacity: {isInstallingUpdate ? 0.6 : 1};"
            >
              {isInstallingUpdate ? '⏳ Téléchargement & compilation en cours...' : `🚀 Installer la mise à jour (${updateStatus.tagName})`}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if updateResult}
      <div class="rounded-lg p-3 space-y-2 text-xs"
           style="background: {updateResult.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {updateResult.ok ? '#22c55e' : '#ef4444'}; color: {updateResult.ok ? '#4ade80' : '#f87171'};">
        <div class="font-semibold">{updateResult.ok ? '✅' : '❌'} {updateResult.text}</div>
        {#if updateResult.logs?.length > 0}
          <details class="mt-1">
            <summary class="cursor-pointer text-[11px] underline">Voir le journal détaillé de mise à jour</summary>
            <div class="mt-2 p-2 rounded font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto"
                 style="background: #090d16; color: #cbd5e1; border: 1px solid #1e293b;">
              {#each updateResult.logs as l}
                <div>
                  <span style="color: #64748b;">[{l.time}]</span>
                  <span style="color: #a78bfa;"> {l.step}</span>
                  {#if l.detail}
                    <div class="pl-4 text-[10px]" style="color: #94a3b8;">{l.detail}</div>
                  {/if}
                </div>
              {/each}
            </div>
          </details>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Info box -->
  <div class="mt-8 rounded-xl p-4" style="background: var(--bg-card); border: 1px solid var(--border);">
    <h3 class="font-semibold mb-3 text-sm">ℹ️ Comment ça marche</h3>
    <ul class="space-y-2 text-sm" style="color: var(--text-muted);">
      <li>• <strong style="color: #e2e8f0;">Glissez-déposez</strong> les indexeurs pour réordonner les priorités</li>
      <li>• <strong style="color: #e2e8f0;">Auto-trier</strong> place les indexeurs freeleech en premier, puis trie par ratio décroissant</li>
      <li>• <strong style="color: #e2e8f0;">Appliquer</strong> envoie les nouvelles priorités à Prowlarr via l'API</li>
      <li>• Le <strong style="color: #22c55e;">badge FL</strong> indique un indexeur avec freeleech actif</li>
      <li>• <strong style="color: #a78bfa;">Auto-tri en arrière-plan</strong> s'exécute automatiquement côté serveur selon l'intervalle configuré</li>
    </ul>
  </div>
</div>
