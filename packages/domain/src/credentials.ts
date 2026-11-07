// Approved in task conversation, 2026-11-07. Never apply to staff credentials.
export const STUDENT_POLICY = "name-roster-ascii-fold-v1";
export function canonicalPassword(
  password: string,
  role: string,
  policy: string,
) {
  if (role === "student" && policy === STUDENT_POLICY) {
    if (!/^[\x20-\x7e]{8,128}$/.test(password))
      throw Error("STUDENT_PASSWORD_ASCII_8_128_REQUIRED");
    return password.replace(/[A-Z]/g, (c) => c.toLowerCase());
  }
  if (password.length < 12 || password.length > 256)
    throw Error("STAFF_PASSWORD_LENGTH");
  return password;
}
export function provisionalCredential(
  name: string,
  className: string,
  section: string,
  roll: string,
) {
  const first = name.trim().split(/\s+/)[0];
  const roster = (className + section + roll).replace(/[^a-zA-Z0-9]/g, "");
  if (!roster) throw Error("INVALID_ROSTER");
  const safe = /^[a-zA-Z]+$/.test(first) ? first : "student";
  const loginId = (safe + "." + roster).slice(0, 60);
  const password = safe + roster;
  if (password.length < 8) throw Error("CREDENTIAL_POLICY_REVIEW_REQUIRED");
  return { loginId, password, policy: STUDENT_POLICY };
}
