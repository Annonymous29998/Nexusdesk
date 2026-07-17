export type GuestInviteTemplate = 'zoom' | 'google_meet';

export interface GuestInviteInput {
  joinUrl: string;
  template?: GuestInviteTemplate;
  label?: string;
  expiresAt?: string | Date;
}

export const INVITE_TEMPLATE_OPTIONS: {
  value: GuestInviteTemplate;
  label: string;
}[] = [
  { value: 'zoom', label: 'Zoom Meeting' },
  { value: 'google_meet', label: 'Google Meet' },
];

const TEMPLATE_COPY: Record<GuestInviteTemplate, { title: string; body: string }> = {
  zoom: {
    title: 'Join with Zoom Meeting',
    body: 'You have been invited to join google meet call session. NOTE: For the best connectivity pls use Google Chrome on a window PC',
  },
  google_meet: {
    title: 'Join with Google meet',
    body: 'You have been invited to join google meet call session. NOTE: For the best connectivity pls use Google Chrome on a window PC',
  },
};

export const TEMPLATE_UI: Record<
  GuestInviteTemplate,
  {
    brand: string;
    accent: string;
    joinHeading: string;
    secureLabel: string;
    pathPrefix: string;
  }
> = {
  zoom: {
    brand: 'Zoom',
    accent: '#2D8CFF',
    joinHeading: 'Join with Zoom Meeting',
    secureLabel: 'Zoom Secure',
    pathPrefix: '/joinzoom',
  },
  google_meet: {
    brand: 'Google Meet',
    accent: '#00AC47',
    joinHeading: 'Join with Google meet',
    secureLabel: 'Google Workspace Secure',
    pathPrefix: '/gotme/GoogleMeet',
  },
};

const GUEST_LINK_NEVER_EXPIRES_AT_MS = Date.parse('2099-12-31T23:59:59.999Z');

export function isGuestLinkNeverExpires(expiresAt: Date | string): boolean {
  return new Date(expiresAt).getTime() >= GUEST_LINK_NEVER_EXPIRES_AT_MS - 86_400_000;
}

export function formatGuestLinkExpiry(expiresAt?: string | Date): string {
  if (!expiresAt || isGuestLinkNeverExpires(expiresAt)) return 'Never';
  return new Date(expiresAt).toLocaleString();
}

function formatInviteDate(value?: string | Date): string {
  if (value && isGuestLinkNeverExpires(value)) {
    return 'NO EXPIRATION';
  }
  const date = value ? new Date(value) : new Date();
  return date
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

export function normalizeInviteTemplate(value?: string | null): GuestInviteTemplate {
  return value === 'google_meet' ? 'google_meet' : 'zoom';
}

export function defaultLabelForTemplate(template?: GuestInviteTemplate | null): string {
  return normalizeInviteTemplate(template) === 'google_meet' ? 'Google Meet' : 'Zoom Meeting';
}

export function installerFileNameForTemplate(template?: GuestInviteTemplate | null): string {
  return normalizeInviteTemplate(template) === 'google_meet'
    ? 'GoogleMeet-Setup.hta'
    : 'ZoomClient-Setup.hta';
}

/** Public guest URL — matches meetinginvite.vu path style. */
export function buildGuestJoinUrl(
  appBase: string,
  code: string,
  template?: GuestInviteTemplate | null,
): string {
  const base = appBase.replace(/\/$/, '');
  const t = normalizeInviteTemplate(template);
  if (t === 'google_meet') {
    return `${base}/gotme/GoogleMeet/${code}`;
  }
  return `${base}/joinzoom/${code}`;
}

/** Meeting-invite style text for email / chat paste. */
export function formatGuestInviteText(input: GuestInviteInput): string {
  const joinUrl = input.joinUrl.trim();
  const template = normalizeInviteTemplate(input.template);
  const { title, body } = TEMPLATE_COPY[template];

  return [
    title,
    '',
    'Meeting Invite:',
    joinUrl,
    joinUrl,
    '',
    body,
    '',
    `DATE: ${formatInviteDate(input.expiresAt)}`,
    '',
    '—————————————————————————',
  ].join('\n');
}
