/** Strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x). */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function isIpv4(ip: string): boolean {
  const parts = normalizeIp(ip).split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export function isIpv6(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (isIpv4(normalized)) return false;
  // Simplified but practical check for compressed IPv6
  return /^[0-9a-f:]+$/i.test(normalized) && normalized.includes(':');
}

export function isIp(ip: string): boolean {
  return isIpv4(ip) || isIpv6(ip);
}

export function isPrivateIpv4(ip: string): boolean {
  if (!isIpv4(ip)) return false;
  const [a, b] = normalizeIp(ip).split('.').map(Number) as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isLoopback(ip: string): boolean {
  const n = normalizeIp(ip);
  return n === '::1' || n.startsWith('127.');
}

/** Convert IPv4 to unsigned 32-bit integer. */
export function ipv4ToInt(ip: string): number {
  if (!isIpv4(ip)) {
    throw new Error(`not an IPv4 address: ${ip}`);
  }
  const parts = normalizeIp(ip).split('.').map(Number);
  return (
    (((parts[0]! << 24) >>> 0) + ((parts[1]! << 16) >>> 0) + ((parts[2]! << 8) >>> 0) + parts[3]!) >>>
    0
  );
}

/** Check if an IPv4 address falls within a CIDR range (e.g. 10.0.0.0/8). */
export function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, prefixRaw] = cidr.split('/');
  if (!range || prefixRaw === undefined || !isIpv4(range) || !isIpv4(ip)) {
    return false;
  }
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

/** True if IP matches any entry in an allowlist (exact IP or IPv4 CIDR). */
export function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const normalized = normalizeIp(ip);
  return allowlist.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (rule.includes('/')) {
      return ipv4InCidr(normalized, rule);
    }
    return normalizeIp(rule) === normalized;
  });
}

/** Extract client IP from common proxy headers (first X-Forwarded-For hop). */
export function clientIpFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const xff = headers['x-forwarded-for'] ?? headers['X-Forwarded-For'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first && isIp(first)) return normalizeIp(first);
  }
  if (Array.isArray(xff) && xff[0]) {
    const first = xff[0].split(',')[0]?.trim();
    if (first && isIp(first)) return normalizeIp(first);
  }

  const realIp = headers['x-real-ip'] ?? headers['X-Real-IP'];
  if (typeof realIp === 'string' && isIp(realIp)) {
    return normalizeIp(realIp);
  }

  return null;
}
