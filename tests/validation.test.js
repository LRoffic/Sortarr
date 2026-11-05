import { describe, it, expect } from 'vitest';
import {
  passwordSchema,
  registerSchema,
  loginSchema,
  verify2FASchema,
  changePasswordSchema,
  totpConfirmSchema,
  totpDisableSchema,
  recaptchaSettingsSchema,
  settingsSchema,
  validateForm
} from '$lib/validation.js';

describe('Validation with Yup and YupPassword', () => {
  describe('passwordSchema (yup-password)', () => {
    it('rejects passwords shorter than 8 chars', async () => {
      const res = await validateForm(passwordSchema, 'Pass1!');
      expect(res.valid).toBe(false);
      expect(res.firstError).toContain('8 caractères');
    });

    it('rejects passwords without lowercase letter', async () => {
      const res = await validateForm(passwordSchema, 'PASSWORD123!');
      expect(res.valid).toBe(false);
      expect(res.firstError).toContain('minuscule');
    });

    it('rejects passwords without uppercase letter', async () => {
      const res = await validateForm(passwordSchema, 'password123!');
      expect(res.valid).toBe(false);
      expect(res.firstError).toContain('majuscule');
    });

    it('rejects passwords without numbers', async () => {
      const res = await validateForm(passwordSchema, 'Password!');
      expect(res.valid).toBe(false);
      expect(res.firstError).toContain('chiffre');
    });

    it('rejects passwords without special symbols', async () => {
      const res = await validateForm(passwordSchema, 'Password123');
      expect(res.valid).toBe(false);
      expect(res.firstError).toContain('spécial');
    });

    it('accepts strong passwords conforming to all requirements', async () => {
      const res = await validateForm(passwordSchema, 'StrongP@ssw0rd!');
      expect(res.valid).toBe(true);
      expect(res.errors).toEqual({});
    });
  });

  describe('registerSchema', () => {
    it('validates a complete valid admin registration', async () => {
      const res = await validateForm(registerSchema, {
        username: 'admin_user',
        password: 'SuperSecret123!',
        confirmPassword: 'SuperSecret123!'
      });
      expect(res.valid).toBe(true);
      expect(res.data.username).toBe('admin_user');
    });

    it('rejects when confirmPassword does not match password', async () => {
      const res = await validateForm(registerSchema, {
        username: 'admin',
        password: 'SuperSecret123!',
        confirmPassword: 'DifferentSecret123!'
      });
      expect(res.valid).toBe(false);
      expect(res.errors.confirmPassword).toContain('ne correspondent pas');
    });

    it('rejects username with invalid characters or too short', async () => {
      const res = await validateForm(registerSchema, {
        username: 'a',
        password: 'SuperSecret123!',
        confirmPassword: 'SuperSecret123!'
      });
      expect(res.valid).toBe(false);
      expect(res.errors.username).toBeDefined();
    });
  });

  describe('loginSchema', () => {
    it('accepts valid credentials with optional captcha', async () => {
      const res = await validateForm(loginSchema, {
        username: 'admin',
        password: 'any_password',
        captchaAnswer: 'ABCDE'
      });
      expect(res.valid).toBe(true);
    });

    it('rejects missing username or missing password', async () => {
      const res = await validateForm(loginSchema, {
        username: '',
        password: ''
      });
      expect(res.valid).toBe(false);
      expect(res.errors.username).toBeDefined();
      expect(res.errors.password).toBeDefined();
    });
  });

  describe('verify2FASchema', () => {
    it('accepts valid 2FA verification payload', async () => {
      const res = await validateForm(verify2FASchema, {
        pendingToken: 'valid.signed.token',
        code: '123456'
      });
      expect(res.valid).toBe(true);
    });

    it('rejects missing pendingToken or code', async () => {
      const res = await validateForm(verify2FASchema, {
        pendingToken: '',
        code: ''
      });
      expect(res.valid).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('validates successful password change with strong new password', async () => {
      const res = await validateForm(changePasswordSchema, {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456#',
        confirmPassword: 'NewStrongPassword456#'
      });
      expect(res.valid).toBe(true);
    });

    it('rejects weak new password and mismatched confirmation', async () => {
      const res = await validateForm(changePasswordSchema, {
        currentPassword: 'OldPassword123!',
        newPassword: 'weak',
        confirmPassword: 'other'
      });
      expect(res.valid).toBe(false);
      expect(res.errors.newPassword).toBeDefined();
      expect(res.errors.confirmPassword).toBeDefined();
    });
  });

  describe('totpConfirmSchema and totpDisableSchema', () => {
    it('accepts 6-digit TOTP code', async () => {
      const res = await validateForm(totpConfirmSchema, { code: '654321' });
      expect(res.valid).toBe(true);
    });

    it('rejects non-numeric or invalid length TOTP code', async () => {
      const res = await validateForm(totpConfirmSchema, { code: 'abc' });
      expect(res.valid).toBe(false);
    });

    it('validates totp disable input', async () => {
      const res = await validateForm(totpDisableSchema, { codeOrPassword: 'secretPassword' });
      expect(res.valid).toBe(true);
    });
  });

  describe('settingsSchema', () => {
    it('validates a correct settings payload', async () => {
      const res = await validateForm(settingsSchema, {
        prowlarrUrl: 'http://localhost:9696',
        prowlarrApiKey: 'my-api-key',
        autoRefreshInterval: 30,
        autoSortInterval: 15,
        taggingEnabled: true,
        taggingTag: 'manual-sort'
      });
      expect(res.valid).toBe(true);
    });

    it('rejects invalid prowlarr URL without protocol', async () => {
      const res = await validateForm(settingsSchema, {
        prowlarrUrl: 'localhost:9696',
        prowlarrApiKey: 'my-api-key'
      });
      expect(res.valid).toBe(false);
      expect(res.errors.prowlarrUrl).toContain('http');
    });

    it('accepts skipTest flag when prowlarr URL is empty', async () => {
      const res = await validateForm(settingsSchema, {
        prowlarrUrl: '',
        prowlarrApiKey: '',
        skipTest: true
      });
      expect(res.valid).toBe(true);
    });
  });
});
