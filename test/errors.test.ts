import { BASE_ERROR_CODES } from '@better-auth/core/error';
import { admin, emailOTP } from 'better-auth/plugins';
import { NEON_AUTH_NETWORK_ERROR_CODES } from '@neondatabase/auth/next/server';
import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, authMessage } from '../src/errors';

const TRY_LATER = "Sign-in isn't working right now. Please try again in a minute.";

/** Codes a visitor can't cause by what they type; they get the try-later line on purpose. */
const TRY_LATER_CODES = new Set([
  'FAILED_TO_CREATE_USER', 'FAILED_TO_CREATE_SESSION', 'FAILED_TO_UPDATE_USER', 'FAILED_TO_GET_SESSION',
  'INVALID_USER', 'PROVIDER_NOT_FOUND', 'ID_TOKEN_NOT_SUPPORTED', 'FAILED_TO_GET_USER_INFO', 'USER_EMAIL_NOT_FOUND',
  'ACCOUNT_NOT_FOUND', 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED', 'VERIFICATION_EMAIL_NOT_ENABLED', 'INVALID_ORIGIN',
  'INVALID_CALLBACK_URL', 'INVALID_REDIRECT_URL', 'INVALID_ERROR_CALLBACK_URL', 'INVALID_NEW_USER_CALLBACK_URL',
  'MISSING_OR_NULL_ORIGIN', 'CALLBACK_URL_REQUIRED', 'FAILED_TO_CREATE_VERIFICATION', 'ASYNC_VALIDATION_NOT_SUPPORTED',
  'METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED', 'BODY_MUST_BE_AN_OBJECT',
  ...NEON_AUTH_NETWORK_ERROR_CODES,
]);

const visitorCodes = [
  ...Object.keys(BASE_ERROR_CODES),
  ...Object.keys(emailOTP({ sendVerificationOTP: async () => {} }).$ERROR_CODES),
  'BANNED_USER',
  ...NEON_AUTH_NETWORK_ERROR_CODES,
];

describe('authMessage', () => {
  it.each(visitorCodes)('has a deliberate answer for %s', (code) => {
    const message = authMessage({ code });
    if (TRY_LATER_CODES.has(code)) expect(message).toBe(TRY_LATER);
    else expect(AUTH_MESSAGES[code], `add wording for ${code} or list it in TRY_LATER_CODES`).toBeTruthy();
  });

  it('knows BANNED_USER is still an admin code', () => {
    expect(Object.keys(admin().$ERROR_CODES)).toContain('BANNED_USER');
  });

  it('never passes the library text through', () => {
    for (const code of visitorCodes) {
      const original = (BASE_ERROR_CODES as Record<string, { message: string }>)[code]?.message;
      if (original) expect(authMessage({ code })).not.toBe(original);
    }
  });

  it('treats a rate limit as too many tries', () => {
    expect(authMessage({ status: 429 })).toBe('Too many tries. Wait a minute and try again.');
    expect(authMessage({ code: 'INVALID_PASSWORD', status: 429 })).toBe('Too many tries. Wait a minute and try again.');
  });

  it('falls back for unknown or missing errors', () => {
    expect(authMessage({ code: 'SOMETHING_NEW' })).toBe(TRY_LATER);
    expect(authMessage(null)).toBe(TRY_LATER);
    expect(authMessage({})).toBe(TRY_LATER);
  });

  it('takes site wording first', () => {
    expect(authMessage({ code: 'USER_ALREADY_EXISTS' }, { USER_ALREADY_EXISTS: 'You already have a table booked with us.' }))
      .toBe('You already have a table booked with us.');
  });
});
