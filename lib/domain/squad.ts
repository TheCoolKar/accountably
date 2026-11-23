export const MIN_SQUAD_MEMBERS = 2;
export const MAX_SQUAD_MEMBERS = 5;
export const SQUAD_NAME_MAX = 50;
export const DISPLAY_NAME_MAX = 40;

export const INVITE_CODE_LENGTH = 10;
export const INVITE_TTL_DAYS = 7;
/** 32 characters, leaving out the look-alikes 0, O, 1 and I. */
export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function canJoinSquad(activeMemberCount: number): boolean {
  return activeMemberCount < MAX_SQUAD_MEMBERS;
}

/** A squad of one is waiting for friends: there is nobody to be accountable to yet. */
export function isWaitingForFriends(activeMemberCount: number): boolean {
  return activeMemberCount < MIN_SQUAD_MEMBERS;
}

/** Strips spaces and dashes and uppercases, so "abcd-efgh 23" still works. */
export function normaliseInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function isInviteCodeShape(code: string): boolean {
  return (
    code.length === INVITE_CODE_LENGTH &&
    [...code].every((char) => INVITE_ALPHABET.includes(char))
  );
}

/** "ABCDEFGH23" → "ABCDE-FGH23" for reading aloud or typing. */
export function formatInviteCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

export function generateInviteCode(
  randomBytes: (length: number) => Uint8Array,
): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += INVITE_ALPHABET[byte % 32];
  return code;
}
