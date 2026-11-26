import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Step 1 of sign-up: name, date of birth, gender and preferred disciplines (website codes). */
export type SignUpStepOne = {
  firstName: string;
  prefix: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  preferredDisciplines: string[];
};

export const emptyStepOne: SignUpStepOne = {
  firstName: '',
  prefix: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  preferredDisciplines: [],
};

type DraftValue = {
  stepOne: SignUpStepOne;
  setStepOne: (value: SignUpStepOne) => void;
};

const DraftContext = createContext<DraftValue | null>(null);

/** Keeps step 1 answers while the user is on step 2. */
export function SignUpDraftProvider({ children }: { children: ReactNode }) {
  const [stepOne, setStepOne] = useState<SignUpStepOne>(emptyStepOne);
  const value = useMemo(() => ({ stepOne, setStepOne }), [stepOne]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useSignUpDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) {
    throw new Error('useSignUpDraft must be used inside SignUpDraftProvider');
  }
  return value;
}

/** Players under this age need a parent or guardian (same limit as the website). */
export const MINOR_AGE = 16;

/** Turns a typed DD-MM-YYYY date into the YYYY-MM-DD the website expects. Null when it isn't a real date. */
export function isoFromDisplayDate(value: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Whole years between a YYYY-MM-DD date and today. */
export function ageFromIsoDate(iso: string, today: Date = new Date()): number {
  const [year, month, day] = iso.split('-').map(Number);
  let age = today.getUTCFullYear() - year;
  const birthdayPassed =
    today.getUTCMonth() + 1 > month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age;
}
