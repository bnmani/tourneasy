import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Step 1 of sign-up: name, date of birth, gender and preferred events. */
export type SignUpStepOne = {
  firstName: string;
  prefix: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  preferredEvents: string[];
};

export const emptyStepOne: SignUpStepOne = {
  firstName: '',
  prefix: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  preferredEvents: ['Open singles', 'Open doubles'],
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
