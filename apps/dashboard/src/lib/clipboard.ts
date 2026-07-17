/**
 * Copy text to the clipboard with a fallback for insecure origins.
 *
 * `navigator.clipboard` is only available in secure contexts (HTTPS or
 * localhost). When the dashboard is served over plain HTTP on a LAN IP
 * (e.g. http://192.168.x.x:3000) it is undefined, so we fall back to a
 * hidden <textarea> + document.execCommand('copy').
 *
 * Returns true on success, false if copying failed entirely.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
