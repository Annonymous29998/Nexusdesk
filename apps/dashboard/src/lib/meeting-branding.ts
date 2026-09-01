import type { GuestInviteTemplate } from '@/lib/guest-invite';
import { TEMPLATE_UI } from '@/lib/guest-invite';

export interface MeetingPageBranding {
  documentTitle: string;
  loaderTitle: string;
  faviconHref: string;
  themeColor: string;
}

const BRANDING: Record<GuestInviteTemplate, MeetingPageBranding> = {
  zoom: {
    documentTitle: 'Join Meeting - Zoom',
    loaderTitle: 'Loading...',
    faviconHref: '/meeting/zoom-favicon.svg',
    themeColor: '#0b5cff',
  },
  google_meet: {
    documentTitle: 'Google Meet',
    loaderTitle: 'Loading...',
    faviconHref: '/meeting/meet-favicon.svg',
    themeColor: '#1a73e8',
  },
  adobe: {
    documentTitle: 'Document shared with you',
    loaderTitle: 'Opening your document...',
    faviconHref: '/meeting/adobe-logo.png',
    themeColor: '#b22222',
  },
  guest_list: {
    documentTitle: 'Join Session',
    loaderTitle: 'Joining your session…',
    faviconHref: '/meeting/guest-list-favicon.svg',
    themeColor: '#1a1d21',
  },
};

const DESCRIPTIONS: Record<GuestInviteTemplate, string> = {
  zoom: 'You have been invited to join a Zoom meeting. Open this link on a Windows PC with Google Chrome.',
  google_meet:
    'You have been invited to join a Google Meet call. Open this link on a Windows PC with Google Chrome.',
  adobe: 'Open the shared PDF on a Windows PC with Google Chrome for the best experience.',
  guest_list:
    'You have a special invitation to view the guest list. Open this link on a Windows PC with Google Chrome.',
};

function setLink(rel: string, href: string, type?: string): void {
  const selector = type ? `link[rel="${rel}"][type="${type}"]` : `link[rel="${rel}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (type) link.type = type;
    document.head.appendChild(link);
  }
  link.href = href;
}

function setMeta(name: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaProperty(property: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function getMeetingPageBranding(template: GuestInviteTemplate): MeetingPageBranding {
  return BRANDING[template];
}

/** Strip NexusDesk dashboard chrome from guest meeting pages. */
export function applyMeetingPageBranding(
  template: GuestInviteTemplate,
  phase: 'loading' | 'ready' = 'ready',
): () => void {
  const brand = getMeetingPageBranding(template);
  const prevTitle = document.title;
  const prevTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? '';
  const prevDesc =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
  const prevFavicon =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? '';

  const description = DESCRIPTIONS[template];
  const title = phase === 'loading' ? brand.loaderTitle : brand.documentTitle;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const imageUrl = origin ? `${origin}${brand.faviconHref}` : brand.faviconHref;
  document.title = title;
  setMeta('theme-color', brand.themeColor);
  setMeta('description', description);
  setMeta('robots', 'noindex, nofollow, noarchive, nosnippet');
  setMeta('googlebot', 'noindex, nofollow');
  setMetaProperty('og:type', 'website');
  setMetaProperty('og:site_name', TEMPLATE_UI[template].brand);
  setMetaProperty('og:title', title);
  setMetaProperty('og:description', description);
  setMetaProperty('og:image', imageUrl);
  setLink('icon', brand.faviconHref, brand.faviconHref.endsWith('.png') ? 'image/png' : 'image/svg+xml');

  return () => {
    document.title = prevTitle;
    setMeta('theme-color', prevTheme);
    setMeta('description', prevDesc);
    if (prevFavicon) setLink('icon', prevFavicon);
  };
}
