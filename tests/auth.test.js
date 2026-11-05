import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  verifyTotpCode,
  buildOtpAuthUri,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  createPending2FAToken,
  verifyPending2FAToken,
  generateBuiltinCaptcha
} from '../src/lib/auth.server.js';

describe('auth & security', () => {
  describe('TOTP (Two-Factor Authentication)', () => {
    it('generates a valid base32 secret', () => {
      const secret = generateTotpSecret(20);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(16);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it('builds a proper otpauth:// URI', () => {
      const secret = generateTotpSecret(20);
      const uri = buildOtpAuthUri('testuser', secret);
      expect(uri).toContain('otpauth://totp/Sortarr');
      expect(uri).toContain('testuser');
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain('issuer=Sortarr');
    });

    it('rejects invalid or blank codes', () => {
      const secret = generateTotpSecret(20);
      expect(verifyTotpCode(secret, '')).toBe(false);
      expect(verifyTotpCode(secret, '12345')).toBe(false);
      expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
      expect(verifyTotpCode('', '123456')).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    const testIp = '192.0.2.123';

    it('allows attempts initially', () => {
      clearFailedAttempts(testIp);
      expect(() => checkRateLimit(testIp)).not.toThrow();
    });

    it('locks out after 5 failed attempts', () => {
      clearFailedAttempts(testIp);
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt(testIp);
        expect(() => checkRateLimit(testIp)).not.toThrow();
      }
      recordFailedAttempt(testIp); // 5th attempt
      expect(() => checkRateLimit(testIp)).toThrow(/Trop de tentatives/);

      // Clearing resets
      clearFailedAttempts(testIp);
      expect(() => checkRateLimit(testIp)).not.toThrow();
    });
  });

  describe('Pending 2FA Tokens', () => {
    it('creates and verifies pending 2fa tokens', () => {
      const username = 'testuser_' + Date.now();
      const token = createPending2FAToken(username);
      expect(typeof token).toBe('string');

      const verifiedUser = verifyPending2FAToken(token);
      expect(verifiedUser).toBe(username);
    });

    it('rejects tampered or invalid tokens', () => {
      expect(verifyPending2FAToken('fake.token.invalid')).toBeNull();
      expect(verifyPending2FAToken('')).toBeNull();
      expect(verifyPending2FAToken(null)).toBeNull();
    });
  });

  describe('Built-in Captcha', () => {
    it('generates a valid challenge with SVG and token', () => {
      const captcha = generateBuiltinCaptcha();
      expect(captcha).toHaveProperty('token');
      expect(captcha).toHaveProperty('svg');
      expect(typeof captcha.token).toBe('string');
      expect(captcha.svg).toContain('<svg');
      expect(captcha.svg).toContain('</svg>');
    });
  });
});
