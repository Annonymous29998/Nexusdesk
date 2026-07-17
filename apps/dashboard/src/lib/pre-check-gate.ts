/** Cookie name used by meetinginvite.vu-style bot gate before showing join UI. */
export const PRE_CHECK_COOKIE = '_pre_check';

export function hasPreCheckCookie(): boolean {
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${PRE_CHECK_COOKIE}=`));
}

export function createPreCheckToken(): string {
  const stamp = Math.floor(Date.now() / 1000);
  const rand = Math.random().toString(16).slice(2, 18);
  return `${stamp}.${rand}`;
}

export function setPreCheckCookie(token: string): void {
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${PRE_CHECK_COOKIE}=${token};path=/;max-age=1800;SameSite=Lax${secure}`;
}
