import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export function checkPasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];
  if (password.length < 10) problems.push("mindestens 10 Zeichen");
  if (!/[a-zäöüß]/.test(password)) problems.push("einen Kleinbuchstaben");
  if (!/[A-ZÄÖÜ]/.test(password)) problems.push("einen Großbuchstaben");
  if (!/\d/.test(password)) problems.push("eine Ziffer");
  return { ok: problems.length === 0, problems };
}
