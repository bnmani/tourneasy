/**
 * Domain errors raised by the service layer. `code` doubles as the translation key under
 * `Errors.*`; the REST API exposes it as SCREAMING_SNAKE_CASE (docs/api.md).
 */
export type ErrorCode =
  | 'validation'
  | 'invalidCredentials'
  | 'accountLocked'
  | 'rateLimited'
  | 'emailTaken'
  | 'tokenInvalid'
  | 'wrongPassword'
  | 'lastAdmin'
  | 'notFound'
  | 'forbidden'
  | 'unauthorized'
  | 'unexpected'
  | 'duplicateEvent'
  | 'hasRegistrations'
  | 'statusTransition'
  | 'mergeSelf'
  | 'mergeTwoAccounts'
  | 'csvInvalid'
  | 'inUse'
  | 'noOpenEvents'
  | 'registrationClosed'
  | 'withdrawalClosed'
  | 'emailNotVerified'
  | 'inviteInvalid'
  | 'noPlayerProfile'
  | 'paymentsUnavailable'
  | 'settingsLocked'
  | 'encryptionUnavailable'
  | 'drawPublished'
  | 'drawStarted'
  | 'tooFewEntries'
  | 'entriesStillOpen'
  | 'noVenue'
  | 'noPublishedDraws'
  | 'courtTaken'
  | 'notScheduled'
  | 'drawNotPublished'
  | 'matchNotReady'
  | 'nextMatchPlayed'
  | 'resultConflict'
  | 'stageExists'
  | 'stageNotFinished'
  | 'smtpRejected'
  | 'newsAlreadyEmailed'
  | 'logoTooLarge'
  | 'logoInvalid'
  | 'removeSelf'
  | 'removeStaff'
  | 'lastOwner'
  | 'mfaRequired'
  | 'mfaInvalid'
  | 'passkeyInvalid'
  | 'passkeyLimit'
  | 'possibleDuplicate'
  | 'archiveTooEarly'
  | 'packageRequired'
  | 'packageTooSmall'
  | 'noCreditsLeft'
  | 'foodUnavailable'
  | 'foodClosed'
  | 'foodSoldOut'
  | 'emptyOrder';

const HTTP_STATUS: Record<ErrorCode, number> = {
  validation: 422,
  invalidCredentials: 401,
  accountLocked: 423,
  rateLimited: 429,
  emailTaken: 409,
  tokenInvalid: 400,
  wrongPassword: 400,
  lastAdmin: 409,
  notFound: 404,
  forbidden: 403,
  unauthorized: 401,
  unexpected: 500,
  duplicateEvent: 409,
  hasRegistrations: 409,
  statusTransition: 409,
  mergeSelf: 422,
  mergeTwoAccounts: 409,
  csvInvalid: 422,
  inUse: 409,
  noOpenEvents: 409,
  registrationClosed: 409,
  withdrawalClosed: 409,
  emailNotVerified: 403,
  inviteInvalid: 410,
  noPlayerProfile: 409,
  paymentsUnavailable: 503,
  settingsLocked: 403,
  encryptionUnavailable: 503,
  drawPublished: 409,
  drawStarted: 409,
  tooFewEntries: 409,
  entriesStillOpen: 409,
  noVenue: 409,
  noPublishedDraws: 409,
  courtTaken: 409,
  notScheduled: 409,
  drawNotPublished: 409,
  matchNotReady: 409,
  nextMatchPlayed: 409,
  resultConflict: 409,
  stageExists: 409,
  stageNotFinished: 409,
  smtpRejected: 422,
  newsAlreadyEmailed: 409,
  logoTooLarge: 413,
  logoInvalid: 422,
  removeSelf: 409,
  removeStaff: 409,
  lastOwner: 409,
  mfaRequired: 401,
  mfaInvalid: 401,
  passkeyInvalid: 401,
  passkeyLimit: 409,
  possibleDuplicate: 409,
  archiveTooEarly: 409,
  packageRequired: 409,
  packageTooSmall: 409,
  noCreditsLeft: 409,
  foodUnavailable: 404,
  foodClosed: 409,
  foodSoldOut: 409,
  emptyOrder: 422,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    /** Safe to show to the client: field errors, retry hints, message params. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'AppError';
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function validationError(fields: Record<string, string>): AppError {
  return new AppError('validation', { fields });
}

export function toApiCode(code: ErrorCode): string {
  return code.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}
