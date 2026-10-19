import { hash, verify } from '@node-rs/argon2';

// argon2id with OWASP's recommended minimum (19 MiB, 2 iterations, 1 lane).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A real hash to verify against when the account doesn't exist, so "unknown user" and
// "wrong password" take the same time (no account enumeration through timing).
let dummyHash: Promise<string> | undefined;

export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
