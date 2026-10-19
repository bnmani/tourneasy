/** Result of a server action form, rendered by the form components. */
export type FormState = {
  ok?: boolean;
  /** Field → error key under Errors.* */
  fields?: Record<string, string>;
  /** Form-level error key under Errors.* */
  error?: string;
  errorParams?: Record<string, string | number>;
  /** Submitted values, to refill the form after an error (React resets forms on submit). */
  values?: Record<string, string | string[]>;
};

export const initialFormState: FormState = {};
