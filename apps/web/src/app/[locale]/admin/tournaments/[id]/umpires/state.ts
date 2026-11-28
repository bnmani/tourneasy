import type { FormState } from '@/components/forms/form-state';

/** Shown once, straight after create or reset. Lives only in the response, never in a URL. */
export type UmpireReveal = {
  displayName: string;
  pin: string;
  qrUrl: string;
  /** The QR code as an image (data URL). */
  qrImage: string;
};

export type UmpireFormState = FormState & { reveal?: UmpireReveal };
