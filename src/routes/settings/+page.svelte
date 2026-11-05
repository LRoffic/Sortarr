<script>
  import { untrack, onMount } from 'svelte';
  import { getTrackerLogo, getTrackerInitials } from '$lib/logos.js';
  import { markdownToHtml } from '$lib/markdown.js';
  import { formatDateTime, formatDate } from '$lib/formatters.js';
  import {
    changePasswordSchema,
    totpConfirmSchema,
    totpDisableSchema,
    recaptchaSettingsSchema,
    settingsSchema,
    validateForm
  } from '$lib/validation.js';

  let { data } = $props();
  let failedLogos = $state({});

  // Système de mise à jour GitHub Releases (https://github.com/LRoffic/Sortarr)
  let updateStatus = $state(null);
  let isCheckingUpdate = $state(false);
  let isInstallingUpdate = $state(false);
  let updateResult = $state(null);
  let selectedReleaseTag = $state(null);
  let showPreviousVersions = $state(false);

  // Release sélectionnée pour affichage des notes (par défaut la dernière)
  let activeRelease = $derived.by(() => {
    if (!updateStatus || !updateStatus.ok) return null;
    if (selectedReleaseTag && Array.isArray(updateStatus.releases)) {
      const found = updateStatus.releases.find((r) => r.tagName === selectedReleaseTag);
      if (found) return found;
    }
    if (!updateStatus.tagName && !updateStatus.latestVersion) return null;
    return {
      tagName: updateStatus.tagName,
      name: updateStatus.releaseName || updateStatus.tagName,
      releaseNotes: updateStatus.releaseNotes || '',
      publishedAt: updateStatus.publishedAt,
      htmlUrl: updateStatus.htmlUrl,
      isLatest: true
    };
  });

  async function checkUpdates(force = false) {
    isCheckingUpdate = true;
    try {
      const res = await fetch(`/api/update${force ? '?force=1' : ''}`);
      const json = await res.json();
      if (!res.ok && !json.error) {
        updateStatus = { ok: false, error: `Erreur HTTP ${res.status}`, currentVersion: data.currentVersion || '1.0.6' };
      } else {
        updateStatus = { ...json, currentVersion: json.currentVersion || data.currentVersion || '1.0.6' };
      }
    } catch (e) {
      updateStatus = { ok: false, error: e.message, currentVersion: data.currentVersion || '1.0.6' };
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

  // Contributeurs GitHub (https://github.com/LRoffic/Sortarr)
  let contributorsData = $state(untrack(() => data.contributors || null));
  let isLoadingContributors = $state(false);

  async function loadContributors(force = false) {
    isLoadingContributors = true;
    try {
      const res = await fetch(`/api/contributors${force ? '?force=1' : ''}`);
      contributorsData = await res.json();
    } catch {
      contributorsData = {
        ok: true,
        contributors: [
          {
            login: 'LRoffic',
            avatarUrl: 'https://avatars.githubusercontent.com/u/4381940?v=4',
            htmlUrl: 'https://github.com/LRoffic',
            contributions: 30,
            type: 'User'
          }
        ]
      };
    } finally {
      isLoadingContributors = false;
    }
  }

  let autoSaveStatus = $state('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  let autoSaveError = $state('');
  let hasMounted = false;
  let autoSaveTimer = null;

  onMount(() => {
    checkUpdates(false);
    loadContributors(false);
    setTimeout(() => {
      hasMounted = true;
    }, 400);
  });

  // untrack() prevents Svelte 5 from warning about capturing initial prop values in $state
  let prowlarrUrl = $state(untrack(() => data.config.prowlarrUrl ?? ''));
  let prowlarrApiKey = $state(untrack(() => data.config.prowlarrApiKey ?? ''));
  let autoRefreshInterval = $state(untrack(() => data.config.autoRefreshInterval ?? 20));
  let autoSortEnabled = $state(untrack(() => !!(data.config.autoSortEnabled)));
  let autoSortInterval = $state(untrack(() => data.config.autoSortInterval ?? 20));
  let apiRatioUrl = $state(untrack(() => data.config.apiRatioUrl ?? ''));

  // Marquage automatique par tag selon le ratio (Radarr / Sonarr / cross-seed)
  let taggingEnabled = $state(untrack(() => !!(data.config.taggingEnabled)));
  let taggingTag = $state(untrack(() => data.config.taggingTag ?? 'no-arr'));
  let taggingRatioThreshold = $state(untrack(() => data.config.taggingRatioThreshold ?? 1.0));
  let taggingExcludeFreeleech = $state(untrack(() => data.config.taggingExcludeFreeleech !== false));
  let radarrUrl = $state(untrack(() => data.config.radarrUrl ?? ''));
  let radarrApiKey = $state(untrack(() => data.config.radarrApiKey ?? ''));
  let sonarrUrl = $state(untrack(() => data.config.sonarrUrl ?? ''));
  let sonarrApiKey = $state(untrack(() => data.config.sonarrApiKey ?? ''));
  let telemetryEnabled = $state(untrack(() => data.config.telemetryEnabled !== false));
  let instanceId = $state(untrack(() => data.config.instanceId ?? ''));

  let isTestingRadarr = $state(false);
  let radarrTestResult = $state(null);
  let isTestingSonarr = $state(false);
  let sonarrTestResult = $state(null);
  let isSyncingTags = $state(false);
  let syncTagsResult = $state(null);

  async function testRadarr() {
    if (!radarrUrl || !radarrApiKey) return;
    isTestingRadarr = true;
    radarrTestResult = null;
    try {
      const res = await fetch('/api/test-arr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: radarrUrl.trim(), apiKey: radarrApiKey.trim(), type: 'radarr' })
      });
      radarrTestResult = await res.json();
    } catch (e) {
      radarrTestResult = { ok: false, error: e.message };
    } finally {
      isTestingRadarr = false;
    }
  }

  async function testSonarr() {
    if (!sonarrUrl || !sonarrApiKey) return;
    isTestingSonarr = true;
    sonarrTestResult = null;
    try {
      const res = await fetch('/api/test-arr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sonarrUrl.trim(), apiKey: sonarrApiKey.trim(), type: 'sonarr' })
      });
      sonarrTestResult = await res.json();
    } catch (e) {
      sonarrTestResult = { ok: false, error: e.message };
    } finally {
      isTestingSonarr = false;
    }
  }

  async function syncTagsNow() {
    taggingEnabled = true;
    isSyncingTags = true;
    syncTagsResult = null;
    try {
      const res = await fetch('/api/sync-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taggingEnabled: true,
          taggingTag,
          taggingRatioThreshold,
          taggingExcludeFreeleech,
          radarrUrl,
          radarrApiKey,
          sonarrUrl,
          sonarrApiKey
        })
      });
      syncTagsResult = await res.json();
    } catch (e) {
      syncTagsResult = { ok: false, error: e.message };
    } finally {
      isSyncingTags = false;
    }
  }

  // Auto-sauvegarde réactive de chaque paramètre
  $effect(() => {
    // Enregistre les dépendances réactives
    const payload = {
      prowlarrUrl,
      prowlarrApiKey,
      autoRefreshInterval,
      autoSortEnabled,
      autoSortInterval,
      apiRatioUrl,
      taggingEnabled,
      taggingTag,
      taggingRatioThreshold,
      taggingExcludeFreeleech,
      radarrUrl,
      radarrApiKey,
      sonarrUrl,
      sonarrApiKey,
      telemetryEnabled,
      instanceId,
      trackers: $state.snapshot(trackers)
    };

    if (!hasMounted) return;

    clearTimeout(autoSaveTimer);
    autoSaveStatus = 'saving';
    autoSaveTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/save-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, skipTest: true })
        });
        const r = await res.json();
        if (!r.ok) throw new Error(r.error || 'Erreur lors de la sauvegarde automatique');
        autoSaveStatus = 'saved';
        setTimeout(() => {
          if (autoSaveStatus === 'saved') autoSaveStatus = 'idle';
        }, 2500);
      } catch (e) {
        autoSaveStatus = 'error';
        autoSaveError = e.message;
      }
    }, 600);
  });
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

  let isTestingTelemetry = $state(false);
  let telemetryTestResult = $state(null);

  async function testTelemetry() {
    isTestingTelemetry = true;
    telemetryTestResult = null;
    try {
      const res = await fetch('/api/telemetry/test', { method: 'POST' });
      if (res.status === 401) {
        telemetryTestResult = { ok: false, error: 'Session expirée : veuillez rafraîchir la page (F5) et vous reconnecter.' };
        return;
      }
      const r = await res.json();
      telemetryTestResult = r;
      if (r.payload?.instance_id && !instanceId) {
        instanceId = r.payload.instance_id;
      }
    } catch (e) {
      telemetryTestResult = { ok: false, error: e.message };
    } finally {
      isTestingTelemetry = false;
    }
  }

  let isSaving = $state(false);
  let saveResult = $state(null);

  // Sécurité : 2FA & reCAPTCHA
  let totpEnabled = $state(untrack(() => !!(data.security?.totpEnabled)));
  let backupCodesRemaining = $state(untrack(() => data.security?.backupCodesRemaining ?? 0));
  let recaptchaSiteKey = $state(untrack(() => data.security?.recaptchaSiteKey ?? ''));
  let recaptchaSecretKey = $state(untrack(() => (data.security?.recaptchaSecretKeySet ? '••••••••' : '')));
  let captchaDisabled = $state(untrack(() => !!(data.security?.captchaDisabled)));
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
  let pwdFieldErrors = $state({});

  // Indicateurs en direct de conformité yup-password
  let newPwdHasMinLength = $derived(newPassword.length >= 8);
  let newPwdHasLowercase = $derived(/[a-z]/.test(newPassword));
  let newPwdHasUppercase = $derived(/[A-Z]/.test(newPassword));
  let newPwdHasNumber = $derived(/[0-9]/.test(newPassword));
  let newPwdHasSymbol = $derived(/[^a-zA-Z0-9\s]/.test(newPassword));

  async function updatePassword() {
    pwdFieldErrors = {};
    secMsg = null;

    const validation = await validateForm(changePasswordSchema, {
      currentPassword,
      newPassword,
      confirmPassword: confirmNewPassword
    });

    if (!validation.valid) {
      pwdFieldErrors = validation.errors || {};
      secMsg = { ok: false, text: validation.firstError };
      return;
    }

    secLoading = true;
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
      if (!r.ok) {
        if (r.errors) pwdFieldErrors = r.errors;
        throw new Error(r.error);
      }
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
    secMsg = null;
    const val = await validateForm(totpConfirmSchema, { code: confirmTotpCode });
    if (!val.valid) {
      secMsg = { ok: false, text: val.firstError };
      return;
    }

    secLoading = true;
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
    secMsg = null;
    const val = await validateForm(totpDisableSchema, { codeOrPassword: disableTotpInput });
    if (!val.valid) {
      secMsg = { ok: false, text: val.firstError };
      return;
    }

    secLoading = true;
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
    secMsg = null;
    const val = await validateForm(recaptchaSettingsSchema, {
      siteKey: recaptchaSiteKey,
      secretKey: recaptchaSecretKey,
      captchaDisabled
    });
    if (!val.valid) {
      secMsg = { ok: false, text: val.firstError };
      return;
    }

    secLoading = true;
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-recaptcha',
          siteKey: recaptchaSiteKey,
          secretKey: recaptchaSecretKey,
          captchaDisabled
        })
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      secMsg = {
        ok: true,
        text: captchaDisabled
          ? 'Captcha totalement désactivé (accès direct sans captcha sur la page de connexion).'
          : recaptchaSiteKey.trim()
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
    crazyUid: '', crazyPass: '', yggCfClearance: '', manualAstra: '',
    freeleech: 'auto', manualUpGB: '', manualDownGB: '', manualSeeds: '',
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
        let crazyUid = saved?.crazyUid ?? '';
        let crazyPass = saved?.crazyPass ?? '';
        let yggCfClearance = saved?.yggCfClearance ?? '';
        if (saved?.apiKey) {
          if (!crazyUid || !crazyPass) {
            const uidM = saved.apiKey.match(/(?:^|;\s*)uid=([^;]+)/i);
            const passM = saved.apiKey.match(/(?:^|;\s*)pass=([^;]+)/i);
            if (uidM && !crazyUid) crazyUid = uidM[1].trim();
            if (passM && !crazyPass) crazyPass = passM[1].trim();
          }
          if (!yggCfClearance) {
            const cfM = saved.apiKey.match(/(?:^|;\s*)cf_clearance=([^;]+)/i);
            if (cfM) yggCfClearance = cfM[1].trim();
          }
        }
        t[idx.id] = {
          ...emptyTracker(),
          type: guessTypeByName(idx.name, idx.privacy),
          ...(idx.privacy === 'public' && !saved ? { enabled: true, type: 'public' } : {}),
          ...(saved ?? {}),
          crazyUid,
          crazyPass,
          yggCfClearance
        };
      }
      return t;
    })
  );
  let trackerTests = $state({});
  let openTrackerLogs = $state({});
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

    const payload = {
      prowlarrUrl,
      prowlarrApiKey,
      autoRefreshInterval,
      autoSortEnabled,
      autoSortInterval,
      apiRatioUrl,
      taggingEnabled,
      taggingTag,
      taggingRatioThreshold,
      taggingExcludeFreeleech,
      radarrUrl,
      radarrApiKey,
      sonarrUrl,
      sonarrApiKey,
      telemetryEnabled,
      instanceId,
      trackers: $state.snapshot(trackers)
    };

    const val = await validateForm(settingsSchema, payload);
    if (!val.valid) {
      saveResult = { ok: false, error: val.firstError, errors: val.errors };
      autoSaveStatus = 'error';
      autoSaveError = val.firstError;
      isSaving = false;
      return;
    }

    try {
      const res = await fetch('/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      saveResult = await res.json();
      if (saveResult.ok) {
        autoSaveStatus = 'saved';
        setTimeout(() => {
          if (autoSaveStatus === 'saved') autoSaveStatus = 'idle';
        }, 3000);
      }
    } catch (e) {
      saveResult = { ok: false, error: e.message };
      autoSaveStatus = 'error';
      autoSaveError = e.message;
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
  <div class="flex items-center justify-between mb-1 gap-2 flex-wrap">
    <h1 class="text-2xl font-bold">Configuration</h1>
    {#if autoSaveStatus === 'saving'}
      <span class="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 animate-pulse"
            style="background: #3b82f622; border: 1px solid #3b82f655; color: #60a5fa;">
        ⏳ Enregistrement auto...
      </span>
    {:else if autoSaveStatus === 'saved'}
      <span class="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 transition-all"
            style="background: #22c55e22; border: 1px solid #22c55e55; color: #4ade80;">
        💾 Enregistré automatiquement
      </span>
    {:else if autoSaveStatus === 'error'}
      <span class="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5"
            style="background: #ef444422; border: 1px solid #ef444455; color: #f87171;"
            title={autoSaveError}>
        ⚠️ Erreur auto-save
      </span>
    {:else}
      <span class="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 opacity-60"
            style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);"
            title="Toutes les modifications sont enregistrées automatiquement">
        💾 Sauvegarde auto active
      </span>
    {/if}
  </div>
  <p class="text-sm mb-8" style="color: var(--text-muted);">
    Paramètres de connexion à votre instance Prowlarr et aux services associés.
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

    <!-- ── Marquage par Tag selon le ratio (Radarr / Sonarr / cross-seed) ── -->
    <div class="rounded-xl p-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-sm font-semibold flex items-center gap-2">
            🏷️ Protection du ratio par Tag (Radarr / Sonarr / Cross-seed)
          </div>
          <div class="text-xs mt-0.5" style="color: var(--text-muted);">
            Ajoute un tag d'exclusion aux indexeurs dont le ratio est inférieur à votre seuil. Radarr et Sonarr ne lanceront plus de téléchargements automatiques sur ces trackers, préservant votre ratio pour le seeding et cross-seed.
          </div>
        </div>
        <!-- Toggle switch -->
        <label class="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
          <input type="checkbox" name="taggingEnabled" bind:checked={taggingEnabled} class="sr-only peer" />
          <div class="w-11 h-6 rounded-full peer transition-colors"
               style="background: {taggingEnabled ? 'var(--accent)' : 'var(--border)'};">
            <div class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                 style="transform: translateX({taggingEnabled ? '20px' : '0px'});"></div>
          </div>
        </label>
      </div>

      {#if taggingEnabled}
        <div class="mt-4 pt-4 space-y-4" style="border-top: 1px solid var(--border);">
          <!-- Paramètres du tag et seuil -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1.5" for="taggingTag">
                🏷️ Nom du tag Prowlarr / *Arr
              </label>
              <input
                id="taggingTag"
                name="taggingTag"
                type="text"
                bind:value={taggingTag}
                placeholder="no-arr"
                class="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
              />
              <p class="text-[11px] mt-1" style="color: var(--text-muted);">
                Par défaut <code>no-arr</code>. Dans Radarr/Sonarr, un indexeur avec un tag n'est utilisé que pour les médias avec ce même tag.
              </p>
            </div>

            <div>
              <label class="block text-xs font-semibold mb-1.5" for="taggingRatioThreshold">
                🎯 Seuil de ratio minimum
              </label>
              <input
                id="taggingRatioThreshold"
                name="taggingRatioThreshold"
                type="number"
                step="0.05"
                min="0"
                bind:value={taggingRatioThreshold}
                placeholder="1.0"
                class="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
              />
              <p class="text-[11px] mt-1" style="color: var(--text-muted);">
                Par défaut <code>1.0</code>. Si le ratio réel du tracker est &lt; seuil, le tag est ajouté. Dès qu'il repasse &ge; seuil, le tag est retiré.
              </p>
            </div>
          </div>

          <!-- Exemption Freeleech -->
          <div class="rounded-lg p-3" style="background: var(--bg-card); border: 1px solid var(--border);">
            <label class="flex items-center gap-3 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                bind:checked={taggingExcludeFreeleech}
                class="w-4 h-4 rounded accent-purple-600 cursor-pointer"
              />
              <div>
                <span class="font-semibold text-emerald-400">⚡ Exempter les trackers en Freeleech (FL)</span>
                <div class="text-[11px] mt-0.5" style="color: var(--text-muted);">
                  Ne pas appliquer le tag si le tracker est actuellement en Freeleech (les téléchargements ne consomment pas de download et ne dégradent pas le ratio).
                </div>
              </div>
            </label>
          </div>

          <!-- Association directe Radarr & Sonarr -->
          <div class="rounded-xl p-3.5 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border);">
            <div>
              <div class="text-xs font-semibold flex items-center gap-1.5">
                🔗 Association directe avec Radarr et Sonarr (optionnel)
              </div>
              <div class="text-[11px] mt-0.5" style="color: var(--text-muted);">
                Renseignez les URLs et clés API de Radarr et Sonarr pour que Sortarr synchronise directement le tag sur leurs indexeurs respectifs.
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Radarr -->
              <div class="p-3 rounded-lg space-y-2.5" style="background: var(--bg-secondary); border: 1px solid var(--border);">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    🎬 Radarr
                  </span>
                  {#if radarrTestResult}
                    <span class="text-[11px] px-2 py-0.5 rounded font-medium"
                          style="background: {radarrTestResult.ok ? '#22c55e22' : '#ef444422'}; color: {radarrTestResult.ok ? '#4ade80' : '#f87171'};">
                      {radarrTestResult.ok ? `Connecté (v${radarrTestResult.version})` : 'Échec connexion'}
                    </span>
                  {/if}
                </div>
                <div>
                  <label class="block text-[11px] mb-1" for="radarrUrl" style="color: var(--text-muted);">URL Radarr</label>
                  <input
                    id="radarrUrl"
                    type="text"
                    bind:value={radarrUrl}
                    placeholder="http://localhost:7878"
                    class="w-full px-2.5 py-1.5 rounded text-xs font-mono"
                    style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
                  />
                </div>
                <div>
                  <label class="block text-[11px] mb-1" for="radarrApiKey" style="color: var(--text-muted);">Clé API Radarr</label>
                  <input
                    id="radarrApiKey"
                    type="text"
                    bind:value={radarrApiKey}
                    placeholder="Clé API Radarr"
                    class="w-full px-2.5 py-1.5 rounded text-xs font-mono"
                    style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
                  />
                </div>
                <button
                  type="button"
                  onclick={testRadarr}
                  disabled={isTestingRadarr || !radarrUrl || !radarrApiKey}
                  class="w-full py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors"
                  style="background: #f59e0b22; border: 1px solid #f59e0b55; color: #fbbf24;"
                >
                  {isTestingRadarr ? '⏳ Test en cours...' : '🔌 Tester connexion Radarr'}
                </button>
                {#if radarrTestResult && !radarrTestResult.ok}
                  <div class="text-[11px] text-red-400 mt-1">❌ {radarrTestResult.error}</div>
                {/if}
              </div>

              <!-- Sonarr -->
              <div class="p-3 rounded-lg space-y-2.5" style="background: var(--bg-secondary); border: 1px solid var(--border);">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                    📺 Sonarr
                  </span>
                  {#if sonarrTestResult}
                    <span class="text-[11px] px-2 py-0.5 rounded font-medium"
                          style="background: {sonarrTestResult.ok ? '#22c55e22' : '#ef444422'}; color: {sonarrTestResult.ok ? '#4ade80' : '#f87171'};">
                      {sonarrTestResult.ok ? `Connecté (v${sonarrTestResult.version})` : 'Échec connexion'}
                    </span>
                  {/if}
                </div>
                <div>
                  <label class="block text-[11px] mb-1" for="sonarrUrl" style="color: var(--text-muted);">URL Sonarr</label>
                  <input
                    id="sonarrUrl"
                    type="text"
                    bind:value={sonarrUrl}
                    placeholder="http://localhost:8989"
                    class="w-full px-2.5 py-1.5 rounded text-xs font-mono"
                    style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
                  />
                </div>
                <div>
                  <label class="block text-[11px] mb-1" for="sonarrApiKey" style="color: var(--text-muted);">Clé API Sonarr</label>
                  <input
                    id="sonarrApiKey"
                    type="text"
                    bind:value={sonarrApiKey}
                    placeholder="Clé API Sonarr"
                    class="w-full px-2.5 py-1.5 rounded text-xs font-mono"
                    style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
                  />
                </div>
                <button
                  type="button"
                  onclick={testSonarr}
                  disabled={isTestingSonarr || !sonarrUrl || !sonarrApiKey}
                  class="w-full py-1.5 rounded text-xs font-semibold cursor-pointer transition-colors"
                  style="background: #0284c722; border: 1px solid #0284c755; color: #38bdf8;"
                >
                  {isTestingSonarr ? '⏳ Test en cours...' : '🔌 Tester connexion Sonarr'}
                </button>
                {#if sonarrTestResult && !sonarrTestResult.ok}
                  <div class="text-[11px] text-red-400 mt-1">❌ {sonarrTestResult.error}</div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Bouton de synchronisation immédiate -->
          <div class="flex items-center justify-between gap-3 flex-wrap pt-2">
            <div class="text-xs" style="color: var(--text-muted);">
              💡 Les tags sont également synchronisés automatiquement lors de l'Auto-tri en arrière-plan et de l'application manuelle des priorités.
            </div>
            <button
              type="button"
              onclick={syncTagsNow}
              disabled={isSyncingTags}
              class="px-4 py-2 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-2"
              style="background: #7c3aed22; border: 1px solid #7c3aed66; color: #c4b5fd;"
            >
              {isSyncingTags ? '⏳ Synchronisation...' : '🏷️ Synchroniser les tags maintenant'}
            </button>
          </div>

          {#if syncTagsResult}
            <div class="p-3.5 rounded-xl text-xs space-y-2"
                 style="background: {syncTagsResult.ok ? '#22c55e15' : '#ef444415'}; border: 1px solid {syncTagsResult.ok ? '#22c55e44' : '#ef444444'};">
              <div class="flex items-center justify-between">
                <span class="font-bold" style="color: {syncTagsResult.ok ? '#4ade80' : '#f87171'};">
                  {syncTagsResult.ok ? '✅ Synchronisation des tags effectuée' : `❌ ${syncTagsResult.reason || 'Erreur'}`}
                </span>
                <button type="button" onclick={() => (syncTagsResult = null)} class="opacity-70 hover:opacity-100 px-1 text-xs">✕</button>
              </div>

              {#if syncTagsResult.ok}
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div class="p-2 rounded" style="background: var(--bg-card);">
                    <strong>Prowlarr :</strong>
                    <div>+{syncTagsResult.prowlarr?.tagged ?? 0} tagués / -{syncTagsResult.prowlarr?.untagged ?? 0} retirés</div>
                  </div>
                  <div class="p-2 rounded" style="background: var(--bg-card);">
                    <strong>Radarr :</strong>
                    {#if syncTagsResult.radarr?.configured}
                      <div>+{syncTagsResult.radarr?.tagged ?? 0} tagués / -{syncTagsResult.radarr?.untagged ?? 0} retirés</div>
                    {:else}
                      <div style="color: var(--text-muted);">Non configuré</div>
                    {/if}
                  </div>
                  <div class="p-2 rounded" style="background: var(--bg-card);">
                    <strong>Sonarr :</strong>
                    {#if syncTagsResult.sonarr?.configured}
                      <div>+{syncTagsResult.sonarr?.tagged ?? 0} tagués / -{syncTagsResult.sonarr?.untagged ?? 0} retirés</div>
                    {:else}
                      <div style="color: var(--text-muted);">Non configuré</div>
                    {/if}
                  </div>
                </div>

                {#if syncTagsResult.details?.length > 0}
                  <details class="mt-2 text-[11px]">
                    <summary class="cursor-pointer underline" style="color: var(--text-muted);">
                      Voir le statut détaillé par indexeur ({syncTagsResult.details.length})
                    </summary>
                    <div class="mt-2 space-y-1 max-h-48 overflow-y-auto p-2 rounded" style="background: var(--bg-card);">
                      {#each syncTagsResult.details as d}
                        <div class="flex items-center justify-between gap-2 py-0.5 border-b border-white/5">
                          <span class="font-medium">{d.name}</span>
                          <div class="flex items-center gap-2">
                            <span style="color: var(--text-muted);">{d.reason}</span>
                            <span class="px-1.5 py-0.5 rounded font-mono text-[10px]"
                                  style="background: {d.shouldTag ? '#ef444422' : '#22c55e22'}; color: {d.shouldTag ? '#f87171' : '#4ade80'};">
                              {d.shouldTag ? `Tagué [${syncTagsResult.tag}]` : 'Non tagué'}
                            </span>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              {/if}
            </div>
          {/if}
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
                {:else if t.type === 'crazyspirits'}
                  <input type="text" bind:value={t.crazyUid}
                         oninput={() => { t.apiKey = `uid=${(t.crazyUid || '').replace(/^uid=/i, '').trim()}; pass=${(t.crazyPass || '').replace(/^pass=/i, '').trim()}`; }}
                         placeholder="UID (ex: 12345)"
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.crazyPass}
                         oninput={() => { t.apiKey = `uid=${(t.crazyUid || '').replace(/^uid=/i, '').trim()}; pass=${(t.crazyPass || '').replace(/^pass=/i, '').trim()}`; }}
                         placeholder="Pass / Hash (ex: a1b2c3d4e5...)"
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.baseUrl}
                         placeholder="URL du tracker (optionnel / vide = https://crazyspirits.com)"
                         class="px-2 py-1.5 rounded col-span-2 text-[11px]" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #94a3b8;" />
                {:else if t.type === 'yggreborn'}
                  <input type="text" bind:value={t.apiKey}
                         placeholder="Token session (valeur directe ou __ygg_sess=...)"
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.yggCfClearance}
                         placeholder="cf_clearance (optionnel si Cloudflare)"
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.baseUrl}
                         placeholder="URL exporter /metrics ou URL du tracker (optionnel / vide = défaut)"
                         class="px-2 py-1.5 rounded col-span-2 text-[11px]" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #94a3b8;" />
                {:else if t.type === 'nostradamus'}
                  <input type="text" bind:value={t.baseUrl}
                         placeholder="URL du tracker (vide = défaut https://nostradamus.ovh)"
                         class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.apiKey}
                         placeholder="Cookie / Clé (valeur directe ou _nostradamus_key=...)"
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                {:else if ['unit3d', 'tr4ker', 'draupnirr', 'astra', 'speedapp', 'teamflix', 'c411', 'v3x', 'custom'].includes(t.type)}
                  <input type="text" bind:value={t.baseUrl}
                         placeholder={
                           t.type === 'custom' ? 'URL complète de l\u2019endpoint profil (JSON)'
                           : t.type === 'v3x' ? 'Optionnel (défaut : https://api.v3x.club/api/me)'
                           : 'URL du tracker (vide = défaut / celle de Prowlarr)'
                         }
                         class="px-2 py-1.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  <input type="text" bind:value={t.apiKey}
                         placeholder={
                           t.type === 'v3x' ? 'Clé API V3X (« Mon profil » ou Torznab)'
                           : t.type === 'speedapp' ? 'Token API (speedapp.io/profile/api-tokens) ou email:motdepasse'
                           : t.type === 'teamflix' ? 'Clé API TeamFlix (My Settings → API Key)'
                           : 'Clé API (vide = celle de Prowlarr)'
                         }
                         class="px-2 py-1.5 rounded font-mono" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                  {#if t.type === 'astra'}
                    <input
                      type="number"
                      step="any"
                      bind:value={t.manualAstra}
                      placeholder="🪙 Solde d'Astra (optionnel si non exposé par l'API)"
                      class="px-2 py-1.5 rounded col-span-2 font-mono text-xs"
                      style="background: var(--bg-secondary); border: 1px solid #581c8766; color: #c084fc;"
                    />
                  {/if}
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
                  <input type="number" step="1" min="0" bind:value={t.manualSeeds} placeholder="🌱 Torrents en seed actifs (optionnel, ex: 15)"
                         class="px-2 py-1.5 rounded col-span-2" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                {:else if t.type === 'public'}
                  <input type="number" step="1" min="0" bind:value={t.manualSeeds} placeholder="🌱 Torrents en seed actifs sur ce tracker (optionnel, ex: 15)"
                         class="px-2 py-1.5 rounded col-span-2" style="background: var(--bg-secondary); border: 1px solid var(--border); color: #e2e8f0;" />
                {/if}
              </div>
            {/if}

            {#if test && !test.loading}
              <div class="mt-2 flex items-center justify-between gap-2 flex-wrap text-xs" style="color: {test.ok ? '#4ade80' : '#f87171'};">
                <div>
                  {#if test.ok && test.stats?.public}
                    ✅ Tracker public — aucun ratio géré {test.stats.seeding !== null && test.stats.seeding !== undefined ? `• 🌱 ${test.stats.seeding} seeds actifs` : ''}
                  {:else if test.ok && test.stats}
                    ✅ Ratio {test.stats.infinite ? '∞' : (test.stats.ratio?.toFixed(2) ?? '—')} • ↑ {fmtBytes(test.stats.uploaded)} • ↓ {fmtBytes(test.stats.downloaded)} • Buffer {fmtBytes(test.stats.buffer)} • {test.stats.pointsLabel || 'Points'} : {test.stats.points !== null && test.stats.points !== undefined ? Math.round(test.stats.points).toLocaleString('fr-FR') : '—'} • 🌱 Seeds : {test.stats.seeding !== null && test.stats.seeding !== undefined ? test.stats.seeding : '—'} • FL : {test.stats.freeleech === null ? 'non détecté' : test.stats.freeleech ? 'oui' : 'non'}
                  {:else}
                    ❌ {test.error || 'Erreur inconnue'}
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => { openTrackerLogs[idx.id] = !openTrackerLogs[idx.id]; }}
                  class="text-[11px] px-2 py-0.5 rounded font-mono cursor-pointer shrink-0 transition-colors"
                  style="background: {openTrackerLogs[idx.id] ? '#334155' : '#1e293b'}; color: {openTrackerLogs[idx.id] ? '#f8fafc' : '#94a3b8'}; border: 1px solid #334155;"
                  title="Afficher ou masquer la console de logs et requêtes pour ce tracker"
                >
                  {openTrackerLogs[idx.id] ? '🔼 Masquer les logs' : '🔍 Voir les logs'}
                </button>
              </div>

              {#if openTrackerLogs[idx.id]}
                <!-- Console de logs dédiée à ce tracker sous sa propre carte -->
                <div class="mt-3 rounded-xl overflow-hidden font-mono text-xs" style="background: #090d16; border: 1px solid #334155;">
                  <div class="flex items-center justify-between px-3 py-2 flex-wrap gap-2"
                       style="background: #0f172a; border-bottom: 1px solid #1e293b;">
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full inline-block" style="background: {test.ok ? '#22c55e' : '#ef4444'};"></span>
                      <span class="font-bold text-[11px]" style="color: #e2e8f0;">
                        Logs &amp; Requêtes HTTP — {idx.name}
                      </span>
                      <span class="text-[10px] px-1.5 py-0.2 rounded" style="background: #1e293b; color: #a78bfa;">
                        {t.type}
                      </span>
                      <span class="text-[10px]" style="color: #64748b;">
                        {test.durationMs ?? 0} ms • {test.debugLogs?.length ?? 0} requête(s)
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        onclick={() => { maskSecrets = !maskSecrets; }}
                        class="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                        style="background: #1e293b; color: {maskSecrets ? '#94a3b8' : '#fbbf24'}; border: 1px solid #334155;"
                        title="Afficher ou masquer les clés API et cookies"
                      >
                        {maskSecrets ? '🔒 Clés masquées' : '🔓 Clés visibles'}
                      </button>
                      <button
                        type="button"
                        onclick={() => { openTrackerLogs[idx.id] = false; }}
                        class="text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                        style="background: #1e293b; color: #cbd5e1; border: 1px solid #334155;"
                      >
                        ✕ Fermer
                      </button>
                    </div>
                  </div>

                  <div class="p-3 max-h-96 overflow-y-auto space-y-2.5">
                    {#if test.error}
                      <div class="px-2.5 py-1.5 rounded text-[11px]" style="background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d;">
                        ❌ {test.error}
                      </div>
                    {/if}

                    {#if test.debugLogs && test.debugLogs.length > 0}
                      <div class="space-y-2">
                        {#each test.debugLogs as req, rIdx}
                          <div class="rounded-lg p-2.5" style="background: #0d121f; border: 1px solid #1e293b;">
                            <div class="flex items-center gap-2 flex-wrap text-[11px]">
                              <span class="px-1.5 py-0.2 rounded font-bold text-[10px]"
                                    style="background: #3b82f622; color: #60a5fa;">
                                {req.method}
                              </span>
                              <span class="px-1.5 py-0.2 rounded font-bold text-[10px]"
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
                              <span class="text-[10px]" style="color: #64748b;">{req.durationMs} ms</span>
                              <span class="break-all" style="color: #cbd5e1;">
                                {maskValue(req.url)}
                              </span>
                            </div>

                            <div class="flex flex-col gap-1.5 mt-2">
                              <details class="group">
                                <summary class="cursor-pointer text-[11px] select-none text-slate-400 hover:text-slate-300">
                                  ▸ En-têtes envoyés (Headers)
                                </summary>
                                <pre class="mt-1 p-2 rounded overflow-x-auto text-[11px]"
                                     style="background: #020617; color: #93c5fd; border: 1px solid #1e293b;">{formatHeadersForDebug(req.requestHeaders)}</pre>
                              </details>

                              <details class="group" open={!test.ok || rIdx === test.debugLogs.length - 1}>
                                <summary class="cursor-pointer text-[11px] select-none text-slate-400 hover:text-slate-300">
                                  ▸ Réponse brute reçue ({req.responsePreview ? `${req.responsePreview.length} car.` : 'vide'})
                                </summary>
                                <pre class="mt-1 p-2 rounded overflow-x-auto max-h-56 text-[11px] whitespace-pre-wrap break-all"
                                     style="background: #020617; color: #a7f3d0; border: 1px solid #1e293b;">{req.responsePreview || '(aucun corps de réponse)'}</pre>
                              </details>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <div class="text-[11px] text-center py-2" style="color: #64748b;">
                        (Aucune trace HTTP enregistrée pour ce test)
                      </div>
                    {/if}

                    {#if test.stats}
                      <details class="group">
                        <summary class="cursor-pointer text-[11px] select-none" style="color: #a78bfa;">
                          ▸ Données extraites et normalisées par Sortarr (stats)
                        </summary>
                        <pre class="mt-1 p-2 rounded overflow-x-auto text-[11px]"
                             style="background: #0d121f; color: #d8b4fe; border: 1px solid #1e293b;">{JSON.stringify(test.stats, null, 2)}</pre>
                      </details>
                    {/if}
                  </div>
                </div>
              {/if}
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
        class="w-full px-6 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
        style="background: var(--accent); color: white; opacity: {isSaving ? 0.6 : 1};"
      >
        {#if isSaving}
          ⏳ Sauvegarde manuelle et test de connexion...
        {:else if autoSaveStatus === 'saved'}
          💾 Configuration enregistrée automatiquement
        {:else}
          💾 Enregistrer et tester la connexion
        {/if}
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
        <div>
          <input
            type="password"
            bind:value={currentPassword}
            placeholder="Mot de passe actuel"
            autocomplete="current-password"
            class="w-full px-2.5 py-1.5 rounded"
            style="background: var(--bg-secondary); border: 1px solid {pwdFieldErrors.currentPassword ? '#ef4444' : 'var(--border)'}; color: #e2e8f0;"
          />
          {#if pwdFieldErrors.currentPassword}
            <p class="text-[10px] text-red-400 mt-0.5">{pwdFieldErrors.currentPassword}</p>
          {/if}
        </div>
        <div>
          <input
            type="password"
            bind:value={newPassword}
            placeholder="Nouveau mot de passe (min. 8 car.)"
            autocomplete="new-password"
            class="w-full px-2.5 py-1.5 rounded"
            style="background: var(--bg-secondary); border: 1px solid {pwdFieldErrors.newPassword ? '#ef4444' : 'var(--border)'}; color: #e2e8f0;"
          />
          {#if pwdFieldErrors.newPassword}
            <p class="text-[10px] text-red-400 mt-0.5">{pwdFieldErrors.newPassword}</p>
          {/if}
        </div>
        <div>
          <input
            type="password"
            bind:value={confirmNewPassword}
            placeholder="Confirmer le nouveau mot de passe"
            autocomplete="new-password"
            class="w-full px-2.5 py-1.5 rounded"
            style="background: var(--bg-secondary); border: 1px solid {pwdFieldErrors.confirmPassword ? '#ef4444' : 'var(--border)'}; color: #e2e8f0;"
          />
          {#if pwdFieldErrors.confirmPassword}
            <p class="text-[10px] text-red-400 mt-0.5">{pwdFieldErrors.confirmPassword}</p>
          {/if}
        </div>
      </div>

      {#if newPassword}
        <!-- Indicateurs dynamiques Yup Password -->
        <div class="p-2 rounded text-[11px] space-y-1" style="background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border);">
          <div class="text-[10px] font-semibold text-slate-400">Exigences requises (Yup Password) :</div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-1 text-[10px]">
            <span class={newPwdHasMinLength ? 'text-emerald-400' : 'text-slate-500'}>
              {newPwdHasMinLength ? '✓' : '○'} 8+ caractères
            </span>
            <span class={newPwdHasUppercase ? 'text-emerald-400' : 'text-slate-500'}>
              {newPwdHasUppercase ? '✓' : '○'} 1 majuscule
            </span>
            <span class={newPwdHasLowercase ? 'text-emerald-400' : 'text-slate-500'}>
              {newPwdHasLowercase ? '✓' : '○'} 1 minuscule
            </span>
            <span class={newPwdHasNumber ? 'text-emerald-400' : 'text-slate-500'}>
              {newPwdHasNumber ? '✓' : '○'} 1 chiffre
            </span>
            <span class={newPwdHasSymbol ? 'text-emerald-400' : 'text-slate-500'}>
              {newPwdHasSymbol ? '✓' : '○'} 1 symbole
            </span>
          </div>
        </div>
      {/if}

      <div class="flex justify-end">
        <button
          type="button"
          onclick={updatePassword}
          disabled={secLoading || !currentPassword || !newPassword || !confirmNewPassword}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style="background: var(--accent); color: white; opacity: {(secLoading || !currentPassword || !newPassword || !confirmNewPassword) ? 0.5 : 1};"
        >
          {secLoading ? '⏳ Modification...' : 'Modifier le mot de passe'}
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

    <!-- Bloc reCAPTCHA & Désactivation Captcha -->
    <div class="rounded-lg p-3 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-xs font-semibold">🛡️ Protection Captcha lors de la connexion</div>
          <div class="text-[11px] mt-0.5" style="color: var(--text-muted);">
            Sécurise la page <code>/login</code> contre les tentatives automatisées.
          </div>
        </div>
        <!-- Toggle désactiver totalement le captcha -->
        <label class="flex items-center gap-2 cursor-pointer select-none text-xs">
          <input
            type="checkbox"
            bind:checked={captchaDisabled}
            onchange={() => saveRecaptcha()}
            class="w-4 h-4 rounded accent-red-500 cursor-pointer"
          />
          <span style="color: {captchaDisabled ? '#f87171' : 'var(--text-muted)'}; font-weight: {captchaDisabled ? 'bold' : 'normal'};">
            {captchaDisabled ? '🚫 Captcha désactivé' : 'Désactiver totalement le captcha'}
          </span>
        </label>
      </div>

      {#if captchaDisabled}
        <div class="p-2.5 rounded text-xs" style="background: #ef444415; border: 1px solid #ef444444; color: #fca5a5;">
          ⚠️ <strong>Le captcha est entièrement désactivé :</strong> aucun contrôle visuel ni Google reCAPTCHA ne sera demandé lors de la connexion (recommandé si Sortarr est accessible sur votre réseau local sécurisé).
        </div>
      {:else}
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
      {/if}

      <div class="flex justify-end">
        <button
          type="button"
          onclick={saveRecaptcha}
          disabled={secLoading}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style="background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa;"
        >
          {secLoading ? '⏳ Enregistrement...' : 'Enregistrer la configuration captcha'}
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
              <span
                class="font-mono font-bold ml-1 px-2 py-0.5 rounded cursor-help"
                style="background: #7c3aed22; color: #a78bfa;"
                data-tooltip={updateStatus.lastUpdatedAt ? `Dernière mise à jour : ${formatDateTime(updateStatus.lastUpdatedAt)}` : `Version installée : v${updateStatus.currentVersion || data.currentVersion || '1.0.6'}`}
              >
                v{updateStatus.currentVersion || data.currentVersion || '1.0.6'}
              </span>
            </div>
            <div>
              <span style="color: var(--text-muted);">Dernière release GitHub :</span>
              {#if updateStatus.noReleasesYet}
                <span class="font-mono ml-1 px-2 py-0.5 rounded" style="background: #1e293b; color: #94a3b8;">
                  Aucune release publiée
                </span>
              {:else if updateStatus.tagName || updateStatus.latestVersion}
                <span
                  class="font-mono font-bold ml-1 px-2 py-0.5 rounded cursor-help"
                  style="background: {updateStatus.updateAvailable ? '#22c55e22' : '#1e293b'}; color: {updateStatus.updateAvailable ? '#4ade80' : '#cbd5e1'};"
                  data-tooltip={updateStatus.publishedAt ? `Publiée le ${formatDateTime(updateStatus.publishedAt)}` : ''}
                >
                  {updateStatus.tagName || `v${updateStatus.latestVersion}`}
                </span>
              {:else}
                <span class="font-mono ml-1 px-2 py-0.5 rounded" style="background: #1e293b; color: #94a3b8;">
                  {updateStatus.error ? 'Indisponible' : '—'}
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

        {#if activeRelease && activeRelease.releaseNotes && !updateStatus.noReleasesYet}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between flex-wrap gap-2 text-[11px]" style="color: var(--text-muted);">
              <span class="font-semibold flex items-center gap-1.5 flex-wrap">
                📋 Notes de version — 
                <span
                  class="font-bold text-slate-200 cursor-help"
                  data-tooltip={activeRelease.publishedAt ? `Publiée le ${formatDateTime(activeRelease.publishedAt)}` : ''}
                >
                  {activeRelease.name || activeRelease.tagName}
                </span>
                {#if activeRelease.tagName === updateStatus.tagName}
                  <span
                    class="px-1.5 py-0.2 rounded text-[10px] cursor-help"
                    style="background: #22c55e22; color: #4ade80;"
                    data-tooltip={activeRelease.publishedAt ? `Publiée le ${formatDateTime(activeRelease.publishedAt)}` : ''}
                  >
                    Dernière release
                  </span>
                {/if}
              </span>
              {#if selectedReleaseTag && selectedReleaseTag !== updateStatus.tagName}
                <button
                  type="button"
                  onclick={() => { selectedReleaseTag = updateStatus.tagName; }}
                  class="text-[10px] underline cursor-pointer hover:text-white"
                  style="color: #a78bfa;"
                >
                  ↺ Revenir à la dernière version ({updateStatus.tagName})
                </button>
              {/if}
            </div>

            <!-- Rendu HTML de la release note convertie depuis le Markdown -->
            <div class="p-3.5 rounded-lg text-xs max-h-80 overflow-y-auto space-y-2 leading-relaxed"
                 style="background: var(--bg-secondary); border: 1px solid var(--border); color: #cbd5e1;">
              {@html markdownToHtml(activeRelease.releaseNotes)}
            </div>
          </div>
        {/if}

        <!-- Lien et liste déroulante pour consulter l'historique des versions précédentes -->
        {#if updateStatus.releases && updateStatus.releases.length > 0}
          <div class="pt-1">
            <button
              type="button"
              onclick={() => { showPreviousVersions = !showPreviousVersions; }}
              class="flex items-center gap-1.5 text-xs font-semibold cursor-pointer py-1 transition-colors hover:opacity-80"
              style="color: #a78bfa;"
            >
              <span>{showPreviousVersions ? '▾' : '▸'}</span>
              <span>📜 Consulter l'historique des versions ({updateStatus.releases.length})</span>
            </button>

            {#if showPreviousVersions}
              <div class="mt-2 p-3 rounded-lg space-y-3" style="background: var(--bg-secondary); border: 1px solid var(--border);">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <label class="block text-xs font-medium" style="color: var(--text-muted);" for="release-select">
                    Sélectionner une version dans la liste déroulante :
                  </label>
                  <span class="text-[11px]" style="color: var(--text-muted);">
                    {updateStatus.releases.length} version(s) répertoriée(s)
                  </span>
                </div>

                <!-- Liste déroulante (select) -->
                <select
                  id="release-select"
                  bind:value={selectedReleaseTag}
                  class="w-full px-3 py-2 rounded-lg text-xs font-mono cursor-pointer"
                  style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
                >
                  {#each updateStatus.releases as rel}
                    <option value={rel.tagName}>
                      {rel.tagName} — {rel.name} {rel.publishedAt ? `(${formatDateTime(rel.publishedAt)})` : ''} {rel.tagName === updateStatus.tagName ? '★ (Dernière)' : ''}
                    </option>
                  {/each}
                </select>

                <!-- Accès rapide direct par boutons badges -->
                <div class="flex items-center gap-1.5 flex-wrap pt-1">
                  <span class="text-[11px]" style="color: var(--text-muted);">Accès rapide :</span>
                  {#each updateStatus.releases as rel}
                    <button
                      type="button"
                      onclick={() => { selectedReleaseTag = rel.tagName; }}
                      class="px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-all cursor-pointer"
                      style="background: {(selectedReleaseTag || updateStatus.tagName) === rel.tagName ? 'var(--accent)' : 'var(--bg-card)'};
                             color: {(selectedReleaseTag || updateStatus.tagName) === rel.tagName ? '#ffffff' : '#cbd5e1'};
                             border: 1px solid {(selectedReleaseTag || updateStatus.tagName) === rel.tagName ? 'var(--accent)' : 'var(--border)'};"
                      data-tooltip={rel.publishedAt ? `Publiée le ${formatDateTime(rel.publishedAt)}` : ''}
                    >
                      {rel.tagName}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
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
              class="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-md transition-transform hover:scale-102"
              style="background: #22c55e; color: #052e16; opacity: {isInstallingUpdate ? 0.6 : 1};"
              data-tooltip={updateStatus.publishedAt ? `Publiée le ${formatDateTime(updateStatus.publishedAt)}` : ''}
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

  <!-- Télémétrie anonyme -->
  <div id="telemetry" class="mt-8 rounded-xl p-4 space-y-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold flex items-center gap-2">
            <span>📡</span>
            <span>Télémétrie anonyme</span>
          </h3>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style="background: {telemetryEnabled ? '#22c55e22' : '#ef444422'}; color: {telemetryEnabled ? '#4ade80' : '#f87171'}; border: 1px solid {telemetryEnabled ? '#22c55e44' : '#ef444444'};"
          >
            {telemetryEnabled ? 'Collecte active' : 'Désactivée'}
          </span>
        </div>
        <p class="text-xs mt-0.5" style="color: var(--text-muted);">
          Transmet un ping anonyme lors de la recherche de mises à jour pour aider au suivi global des versions et environnements.
        </p>
      </div>
      <button
        type="button"
        onclick={testTelemetry}
        disabled={isTestingTelemetry}
        class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors hover:bg-slate-800"
        style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
        data-tooltip="Envoie un ping de test (is_test: true) vers le serveur de télémétrie sans impacter les statistiques"
      >
        {isTestingTelemetry ? '⏳ Test en cours...' : '🧪 Tester la télémétrie'}
      </button>
    </div>

    <!-- Switch d'activation / désactivation -->
    <div class="p-3 rounded-lg flex items-center justify-between gap-4 flex-wrap" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="space-y-0.5">
        <label for="telemetry-switch" class="text-xs font-semibold text-slate-200 cursor-pointer">
          Autoriser l'envoi de la télémétrie anonyme
        </label>
        <p class="text-[11px]" style="color: var(--text-muted);">
          Désactivez cette option si vous souhaitez bloquer tout envoi de télémétrie anonyme.
        </p>
      </div>
      <input
        type="checkbox"
        id="telemetry-switch"
        bind:checked={telemetryEnabled}
        class="w-5 h-5 rounded accent-purple-600 cursor-pointer"
      />
    </div>

    <!-- Identifiant d'instance et détails de confidentialité -->
    <div class="p-3 rounded-lg space-y-3 text-xs" style="background: var(--bg-card); border: 1px solid var(--border);">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span style="color: var(--text-muted);">Identifiant d'instance unique (anonyme) :</span>
        <code class="font-mono text-[11px] px-2 py-1 rounded bg-slate-900 text-purple-300 select-all border border-purple-900/40">
          {instanceId || 'Génération automatique...'}
        </code>
      </div>

      <!-- Détail des données envoyées (Garantie de confidentialité) -->
      <div class="pt-2 border-t text-[11px] space-y-2" style="border-color: var(--border);">
        <div class="flex items-center gap-1.5 font-semibold text-slate-300">
          <span>🔒</span>
          <span>Données transmises et garantie d'anonymat :</span>
        </div>
        <p style="color: var(--text-muted);">
          Cette transmission est <strong>100% anonyme</strong>. Aucune adresse IP, nom d'hôte, URL Prowlarr/Arr, clé API ou donnée personnelle n'est stockée ni transmise.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div class="p-2 rounded bg-slate-900/60 border border-slate-800">
            <span class="font-mono text-purple-400 font-semibold">instance_id</span> : Identifiant UUID unique généré aléatoirement une seule fois à l'installation.
          </div>
          <div class="p-2 rounded bg-slate-900/60 border border-slate-800">
            <span class="font-mono text-purple-400 font-semibold">version</span> : Version installée de Sortarr.
          </div>
          <div class="p-2 rounded bg-slate-900/60 border border-slate-800">
            <span class="font-mono text-purple-400 font-semibold">os & arch</span> : Système d'exploitation (linux, windows, macos) et architecture CPU (x64, arm64).
          </div>
          <div class="p-2 rounded bg-slate-900/60 border border-slate-800">
            <span class="font-mono text-purple-400 font-semibold">is_docker & branch</span> : Détection d'environnement conteneur Docker et branche de déploiement (main).
          </div>
        </div>
      </div>
    </div>

    <!-- Résultat du test de télémétrie -->
    {#if telemetryTestResult}
      <div class="rounded-lg p-3 space-y-1.5 text-xs"
           style="background: {telemetryTestResult.ok ? '#22c55e22' : '#ef444422'}; border: 1px solid {telemetryTestResult.ok ? '#22c55e' : '#ef4444'}; color: {telemetryTestResult.ok ? '#4ade80' : '#f87171'};">
        <div class="font-semibold flex items-center gap-1.5">
          <span>{telemetryTestResult.ok ? '✅' : '❌'}</span>
          <span>{telemetryTestResult.ok ? 'Communication réussie avec le serveur de télémétrie Sortarr' : `Échec de communication : ${telemetryTestResult.error || 'Erreur inconnue'}`}</span>
        </div>
        {#if telemetryTestResult.data?.message}
          <div class="text-[11px] text-slate-300">
            {telemetryTestResult.data.message}
          </div>
        {/if}
        {#if telemetryTestResult.data?.privacy}
          <div class="text-[10px] text-slate-400">
            Confidentialité confirmée par le serveur : {telemetryTestResult.data.privacy}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Carte des contributeurs GitHub -->
  <div id="contributors" class="mt-8 rounded-xl p-4 space-y-4" style="background: var(--bg-secondary); border: 1px solid var(--border);">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold flex items-center gap-2">
            <span>👥</span>
            <span>Contributeurs GitHub</span>
          </h3>
          {#if contributorsData?.contributors?.length}
            <span class="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold"
                  style="background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed44;">
              {contributorsData.contributors.length}
            </span>
          {/if}
        </div>
        <p class="text-xs mt-0.5" style="color: var(--text-muted);">
          Merci à tous les développeurs et contributeurs qui soutiennent et font évoluer Sortarr sur
          <a href="https://github.com/LRoffic/Sortarr" target="_blank" rel="noreferrer" class="underline hover:text-purple-300" style="color: #a78bfa;">
            github.com/LRoffic/Sortarr
          </a>
        </p>
      </div>
      <button
        type="button"
        onclick={() => loadContributors(true)}
        disabled={isLoadingContributors}
        class="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors hover:bg-slate-800"
        style="background: var(--bg-card); border: 1px solid var(--border); color: #e2e8f0;"
      >
        {isLoadingContributors ? '⏳ Chargement...' : '🔄 Actualiser'}
      </button>
    </div>

    <!-- Contenu des contributeurs -->
    {#if isLoadingContributors && !contributorsData}
      <div class="p-6 rounded-lg text-center text-xs" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);">
        <span class="inline-block animate-spin mr-2">⏳</span> Chargement des contributeurs GitHub...
      </div>
    {:else if contributorsData?.contributors?.length}
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {#each contributorsData.contributors as contributor}
          <a
            href={contributor.htmlUrl}
            target="_blank"
            rel="noreferrer"
            class="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:scale-[1.01] hover:border-purple-500/50 group"
            style="background: var(--bg-card); border: 1px solid var(--border);"
          >
            <img
              src={contributor.avatarUrl}
              alt={contributor.login}
              class="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-purple-500/20 group-hover:ring-purple-500/60 transition-all"
              loading="lazy"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-sm text-white group-hover:text-purple-300 transition-colors truncate">
                  {contributor.login}
                </span>
                {#if contributor.login === 'LRoffic'}
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider"
                        style="background: #eab30822; color: #facc15; border: 1px solid #eab30844;"
                        title="Créateur du projet">
                    Owner
                  </span>
                {/if}
              </div>
              <div class="flex items-center gap-2 mt-1 text-[11px]" style="color: var(--text-muted);">
                <span class="flex items-center gap-1">
                  <span style="color: #4ade80;">●</span>
                  <span>{contributor.contributions} contribution{contributor.contributions > 1 ? 's' : ''}</span>
                </span>
                <span>•</span>
                <span class="group-hover:underline text-purple-400">Profil ↗</span>
              </div>
            </div>
          </a>
        {/each}
      </div>

      <!-- Footer CTA de la carte -->
      <div class="p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
           style="background: var(--bg-card); border: 1px solid var(--border);">
        <div class="flex items-center gap-2 text-[11px]" style="color: var(--text-muted);">
          <span>💡</span>
          <span>Vous souhaitez participer au projet, signaler un bug ou proposer une fonctionnalité ?</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href="https://github.com/LRoffic/Sortarr/graphs/contributors"
            target="_blank"
            rel="noreferrer"
            class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors hover:bg-slate-800"
            style="border: 1px solid var(--border); color: #cbd5e1;"
          >
            📊 Graphique des commits ↗
          </a>
          <a
            href="https://github.com/LRoffic/Sortarr/pulls"
            target="_blank"
            rel="noreferrer"
            class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors hover:bg-purple-900/50"
            style="background: #7c3aed22; border: 1px solid #7c3aed55; color: #a78bfa;"
          >
            Contribuer sur GitHub ↗
          </a>
        </div>
      </div>
    {:else}
      <div class="p-4 rounded-lg text-center text-xs" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);">
        Aucun contributeur disponible pour le moment.
      </div>
    {/if}
  </div>

</div>

<!-- Notification toast en bas à gauche lors de la sauvegarde -->
{#if autoSaveStatus === 'saved'}
  <div class="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 pointer-events-none"
       style="background: #0f172aee; backdrop-filter: blur(12px); border: 1px solid #22c55e77; color: #4ade80; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
    <span class="text-xl">💾</span>
    <div>
      <div class="text-xs font-bold text-white">Paramètres sauvegardés</div>
      <div class="text-[11px] text-gray-300">Vos modifications ont été enregistrées avec succès.</div>
    </div>
  </div>
{:else if autoSaveStatus === 'error'}
  <div class="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 pointer-events-none"
       style="background: #0f172aee; backdrop-filter: blur(12px); border: 1px solid #ef444477; color: #f87171; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
    <span class="text-xl">⚠️</span>
    <div>
      <div class="text-xs font-bold text-white">Erreur de sauvegarde</div>
      <div class="text-[11px] text-gray-300">{autoSaveError || 'Impossible de sauvegarder la configuration.'}</div>
    </div>
  </div>
{/if}
