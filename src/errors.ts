export type CloudError = { code?: string; status?: number } | null | undefined;

const TRY_LATER = "Sign-in isn't working right now. Please try again in a minute.";
const TOO_MANY = 'Too many tries. Wait a minute and try again.';

export const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email or password doesn't match.",
  INVALID_PASSWORD: "That password doesn't match.",
  INVALID_EMAIL: "That email doesn't look right.",
  USER_NOT_FOUND: "There's no account with that email.",
  USER_ALREADY_EXISTS: "There's already an account with that email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account with that email.",
  PASSWORD_TOO_SHORT: 'Use at least 8 characters for the password.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first: check your inbox for the code.',
  EMAIL_ALREADY_VERIFIED: 'Your email is already confirmed. You can sign in.',
  EMAIL_MISMATCH: "That email doesn't match this account.",
  EMAIL_CAN_NOT_BE_UPDATED: "The email on this account can't be changed.",
  CHANGE_EMAIL_DISABLED: "The email on this account can't be changed.",
  INVALID_OTP: "That code isn't right. Check it and try again.",
  OTP_EXPIRED: 'That code has expired. Ask for a new one.',
  INVALID_TOKEN: "That link isn't valid anymore. Ask for a new one.",
  TOKEN_EXPIRED: 'That link has expired. Ask for a new one.',
  TOO_MANY_ATTEMPTS: TOO_MANY,
  BANNED_USER: "This account can't sign in.",
  SESSION_EXPIRED: 'You were signed out. Please sign in again.',
  SESSION_NOT_FRESH: 'For your security, sign in again to do this.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account doesn't have a password yet.",
  USER_ALREADY_HAS_PASSWORD: 'This account already has a password.',
  PASSWORD_ALREADY_SET: 'This account already has a password.',
  FAILED_TO_UNLINK_LAST_ACCOUNT: "You can't remove your only way to sign in.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: 'That account is already connected.',
  LINKED_ACCOUNT_ALREADY_EXISTS: 'That account is already connected.',
  MISSING_FIELD: 'Fill in every field and try again.',
  VALIDATION_ERROR: 'Check what you entered and try again.',
  FIELD_NOT_ALLOWED: 'Check what you entered and try again.',
};

/** Plain words for a sign-in error, never the library's own text. */
export function authMessage(error: CloudError, overrides: Record<string, string> = {}): string {
  if (error?.status === 429) return overrides.TOO_MANY_ATTEMPTS ?? TOO_MANY;
  const code = error?.code;
  return (code && (overrides[code] ?? AUTH_MESSAGES[code])) || TRY_LATER;
}

export const MESSAGES = {
  unavailable: "This isn't available right now. Please try again later.",
  saveFailed: "Couldn't save right now. Please try again later.",
  uploadsPaused: 'Uploads are paused right now. Please try again later.',
  fileType: "That type of file can't be uploaded here.",
  fileTooLarge: (mb: number) => `That file is too big. The limit is ${mb} MB.`,
} as const;
