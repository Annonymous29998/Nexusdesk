import type { GuestInviteTemplate } from '@/lib/guest-invite';

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

  document.title = phase === 'loading' ? brand.loaderTitle : brand.documentTitle;
  setMeta('theme-color', brand.themeColor);
  setMeta('description', 'Join your meeting');
  setLink('icon', brand.faviconHref, 'image/svg+xml');

  return () => {
    document.title = prevTitle;
    setMeta('theme-color', prevTheme);
    setMeta('description', prevDesc);
    if (prevFavicon) setLink('icon', prevFavicon, 'image/svg+xml');
  };
}
