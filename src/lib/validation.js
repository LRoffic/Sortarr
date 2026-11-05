import * as yup from 'yup';
import yupPasswordPkg from 'yup-password';

const extendYupPassword = yupPasswordPkg?.default || yupPasswordPkg;
if (typeof extendYupPassword === 'function') {
  extendYupPassword(yup);
}

// Configuration de la locale française pour Yup
yup.setLocale({
  mixed: {
    default: 'Valeur invalide',
    required: 'Ce champ est requis',
    oneOf: 'La valeur doit correspondre'
  },
  string: {
    min: ({ min }) => `Doit contenir au moins ${min} caractère${min > 1 ? 's' : ''}`,
    max: ({ max }) => `Ne doit pas dépasser ${max} caractère${max > 1 ? 's' : ''}`,
    url: 'Doit être une URL valide',
    minLowercase: ({ length }) => `Doit contenir au moins ${length} lettre minuscule`,
    minUppercase: ({ length }) => `Doit contenir au moins ${length} lettre majuscule`,
    minNumbers: ({ length }) => `Doit contenir au moins ${length} chiffre`,
    minSymbols: ({ length }) => `Doit contenir au moins ${length} caractère spécial`
  },
  number: {
    min: ({ min }) => `Doit être supérieur ou égal à ${min}`,
    max: ({ max }) => `Doit être inférieur ou égal à ${max}`,
    integer: 'Doit être un entier'
  }
});

// Règle de mot de passe renforcé sécurisé avec yup-password
export const passwordSchema = yup
  .string()
  .password()
  .min(8, 'Le mot de passe doit comporter au moins 8 caractères')
  .max(128, 'Le mot de passe ne doit pas dépasser 128 caractères')
  .minLowercase(1, 'Le mot de passe doit contenir au moins 1 lettre minuscule')
  .minUppercase(1, 'Le mot de passe doit contenir au moins 1 lettre majuscule')
  .minNumbers(1, 'Le mot de passe doit contenir au moins 1 chiffre')
  .minSymbols(1, 'Le mot de passe doit contenir au moins 1 caractère spécial');

// Schéma d'inscription administrateur
export const registerSchema = yup.object({
  username: yup
    .string()
    .trim()
    .required("L'identifiant est requis")
    .min(3, "L'identifiant doit comporter au moins 3 caractères")
    .max(50, "L'identifiant ne doit pas dépasser 50 caractères")
    .matches(
      /^[a-zA-Z0-9_.-]+$/,
      "L'identifiant ne peut contenir que des lettres, chiffres, tirets, points et underscores"
    ),
  password: passwordSchema.required('Le mot de passe est requis'),
  confirmPassword: yup
    .string()
    .required('Veuillez confirmer le mot de passe')
    .oneOf([yup.ref('password')], 'Les mots de passe ne correspondent pas')
});

// Schéma de connexion
export const loginSchema = yup.object({
  username: yup.string().trim().required("L'identifiant est requis"),
  password: yup.string().required('Le mot de passe est requis'),
  recaptchaToken: yup.string().nullable().optional(),
  captchaToken: yup.string().nullable().optional(),
  captchaAnswer: yup.string().nullable().optional()
});

// Schéma de validation double authentification (étape 2 login)
export const verify2FASchema = yup.object({
  pendingToken: yup.string().required('Jeton de session 2FA manquant'),
  code: yup
    .string()
    .trim()
    .required('Le code 2FA ou code de secours est requis')
    .min(6, 'Le code doit contenir au moins 6 caractères')
    .max(32, 'Le code ne doit pas dépasser 32 caractères')
});

// Schéma de changement de mot de passe utilisateur
export const changePasswordSchema = yup.object({
  currentPassword: yup.string().required('Le mot de passe actuel est requis'),
  newPassword: passwordSchema.required('Le nouveau mot de passe est requis'),
  confirmPassword: yup
    .string()
    .required('Veuillez confirmer le nouveau mot de passe')
    .oneOf([yup.ref('newPassword')], 'Les nouveaux mots de passe ne correspondent pas')
});

// Schéma de confirmation TOTP (activation 2FA)
export const totpConfirmSchema = yup.object({
  code: yup
    .string()
    .trim()
    .required('Le code de validation TOTP est requis')
    .matches(/^\d{6}$/, 'Le code TOTP doit comporter exactement 6 chiffres')
});

// Schéma de désactivation 2FA
export const totpDisableSchema = yup.object({
  codeOrPassword: yup
    .string()
    .trim()
    .required('Le code 2FA ou mot de passe est requis pour désactiver la protection')
});

// Schéma de configuration reCAPTCHA
export const recaptchaSettingsSchema = yup.object({
  siteKey: yup.string().trim().nullable().optional(),
  secretKey: yup.string().trim().nullable().optional(),
  captchaDisabled: yup.boolean().default(false)
});

// Schéma des paramètres globaux de Sortarr
export const settingsSchema = yup.object({
  prowlarrUrl: yup
    .string()
    .trim()
    .when('skipTest', {
      is: true,
      then: (schema) => schema.nullable().optional(),
      otherwise: (schema) =>
        schema
          .required("L'URL Prowlarr est requise")
          .matches(/^https?:\/\//i, "L'URL Prowlarr doit commencer par http:// ou https://")
    }),
  prowlarrApiKey: yup
    .string()
    .trim()
    .when('skipTest', {
      is: true,
      then: (schema) => schema.nullable().optional(),
      otherwise: (schema) => schema.required('La clé API Prowlarr est requise')
    }),
  autoRefreshInterval: yup
    .number()
    .integer('L’intervalle doit être un entier')
    .min(5, 'Intervalle minimum : 5 minutes')
    .max(1440, 'Intervalle maximum : 1440 minutes')
    .default(20),
  autoSortEnabled: yup.boolean().default(false),
  autoSortInterval: yup
    .number()
    .integer('L’intervalle de tri doit être un entier')
    .min(5, 'Intervalle minimum : 5 minutes')
    .max(1440, 'Intervalle maximum : 1440 minutes')
    .default(20),
  taggingEnabled: yup.boolean().default(false),
  taggingTag: yup
    .string()
    .trim()
    .max(50, 'Le tag ne doit pas dépasser 50 caractères')
    .default('no-arr'),
  taggingRatioThreshold: yup
    .number()
    .min(0, 'Le seuil de ratio ne peut pas être négatif')
    .max(100, 'Seuil de ratio trop élevé')
    .default(1.0),
  taggingExcludeFreeleech: yup.boolean().default(true),
  radarrUrl: yup
    .string()
    .trim()
    .nullable()
    .test('is-valid-url', "L'URL Radarr doit commencer par http:// ou https://", (v) => {
      if (!v) return true;
      return /^https?:\/\//i.test(v);
    }),
  radarrApiKey: yup.string().trim().nullable().optional(),
  sonarrUrl: yup
    .string()
    .trim()
    .nullable()
    .test('is-valid-url', "L'URL Sonarr doit commencer par http:// ou https://", (v) => {
      if (!v) return true;
      return /^https?:\/\//i.test(v);
    }),
  sonarrApiKey: yup.string().trim().nullable().optional(),
  apiRatioUrl: yup.string().trim().nullable().optional(),
  instanceId: yup.string().trim().nullable().optional(),
  instance_id: yup.string().trim().nullable().optional(),
  telemetryEnabled: yup.boolean().default(true),
  trackers: yup.object().optional(),
  skipTest: yup.boolean().optional()
});

/**
 * Valide des données avec un schéma Yup et retourne un résultat formaté.
 * @param {yup.Schema} schema
 * @param {any} data
 * @returns {Promise<{ valid: boolean, data?: any, errors: Record<string, string>, firstError?: string }>}
 */
export async function validateForm(schema, data) {
  try {
    const validData = await schema.validate(data, { abortEarly: false, stripUnknown: false });
    return { valid: true, data: validData, errors: {} };
  } catch (err) {
    if (err.inner && err.inner.length > 0) {
      const errors = {};
      for (const e of err.inner) {
        if (e.path && !errors[e.path]) {
          errors[e.path] = e.message;
        }
      }
      return { valid: false, errors, firstError: err.inner[0]?.message || err.message };
    }
    return { valid: false, errors: { _general: err.message }, firstError: err.message };
  }
}

export { yup };
