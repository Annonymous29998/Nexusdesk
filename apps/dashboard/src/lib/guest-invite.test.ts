import { describe, expect, it } from 'vitest';
import {
  formatGuestInviteText,
  buildGuestJoinUrl,
  formatGuestLinkExpiry,
} from '@/lib/guest-invite';

describe('formatGuestInviteText', () => {
  it('formats zoom template', () => {
    const text = formatGuestInviteText({
      joinUrl: 'http://192.168.18.5:3000/join/ABC12345',
      template: 'zoom',
      expiresAt: '2026-07-14T12:00:00.000Z',
    });

    expect(text).toContain('Join with Zoom Meeting');
    expect(text).toContain('Google Chrome on a window PC');
    expect(text).toContain('DATE: JULY 14, 2026');
  });

  it('formats zoom template with joinzoom path', () => {
    const url = buildGuestJoinUrl('http://192.168.18.5:3000', 'ABC12345', 'zoom');
    expect(url).toBe('http://192.168.18.5:3000/joinzoom/ABC12345');
  });

  it('formats google meet template', () => {
    const url = buildGuestJoinUrl('http://192.168.18.5:3000', 'ABC12345', 'google_meet');
    expect(url).toBe('http://192.168.18.5:3000/gotme/GoogleMeet/ABC12345');

    const text = formatGuestInviteText({
      joinUrl: url,
      template: 'google_meet',
      expiresAt: '2026-07-14T12:00:00.000Z',
    });

    expect(text).toContain('Join with Google meet');
    expect(text.match(/gotme\/GoogleMeet\/ABC12345/g)?.length).toBe(2);
  });

  it('shows no expiration for never-expiring links', () => {
    const text = formatGuestInviteText({
      joinUrl: 'http://192.168.18.5:3000/joinzoom/ABC12345',
      template: 'zoom',
      expiresAt: '2099-12-31T23:59:59.999Z',
    });

    expect(text).toContain('DATE: NO EXPIRATION');
    expect(formatGuestLinkExpiry('2099-12-31T23:59:59.999Z')).toBe('Never');
  });
});
