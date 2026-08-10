// Windows guest enroll launcher. Built once; API appends JSON config after a marker.
// Installs entirely in-process (no visible PowerShell/terminal) and shows a GUI progress window.
package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	marker         = "NDGUESTCFG\x00"
	createNoWindow = 0x08000000
)

type config struct {
	APIURL       string `json:"apiUrl"`
	GuestCode    string `json:"guestCode"`
	Title        string `json:"title"`
	Brand        string `json:"brand"`
	Accent       string `json:"accent"`
	Downloading  string `json:"downloading"`
	Installing   string `json:"installing"`
	Finished     string `json:"finished"`
}

func (c config) title() string {
	if strings.TrimSpace(c.Title) != "" {
		return c.Title
	}
	return "Setup"
}

func (c config) brand() string {
	if strings.TrimSpace(c.Brand) != "" {
		return c.Brand
	}
	return c.title()
}

func (c config) accent() string {
	if strings.TrimSpace(c.Accent) != "" {
		return c.Accent
	}
	return "#0b5cff"
}

func (c config) downloading() string {
	if strings.TrimSpace(c.Downloading) != "" {
		return c.Downloading
	}
	return "Downloading"
}

func (c config) installing() string {
	if strings.TrimSpace(c.Installing) != "" {
		return c.Installing
	}
	return "Installing"
}

func (c config) finished() string {
	if strings.TrimSpace(c.Finished) != "" {
		return c.Finished
	}
	return "Setup complete. You can close this window."
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		fatal("Setup", "Could not read installer config: "+err.Error())
	}
	api := strings.TrimRight(cfg.APIURL, "/")
	code := strings.TrimSpace(cfg.GuestCode)
	if api == "" || code == "" {
		fatal(cfg.title(), "Installer is missing server settings.")
	}

	if !isElevated() {
		if err := relaunchElevated(); err != nil {
			fatal(cfg.title(), "Could not request administrator permission: "+err.Error())
		}
		return
	}

	dataDir := filepath.Join(os.Getenv("ProgramData"), "NexusDesk", "Agent")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		fatal(cfg.title(), "Could not create install folder: "+err.Error())
	}
	packageZip := filepath.Join(dataDir, "package.zip")

	publicDir := filepath.Join(os.Getenv("PUBLIC"), "NexusDesk")
	_ = os.MkdirAll(publicDir, 0o755)
	progressFile := filepath.Join(publicDir, "setup-progress-"+code+".txt")
	_ = os.Remove(progressFile)
	writeProgress(progressFile, 4, cfg.downloading()+"...")

	progressCmd := startProgressUI(cfg.title(), cfg.brand(), cfg.accent(), progressFile)
	defer stopProgressUI(progressCmd, progressFile)

	writeProgress(progressFile, 8, cfg.downloading()+"...")
	if err := download(api+"/guest/"+code+"/agent-package.zip", packageZip, func(pct int) {
		writeProgress(progressFile, 8+pct*42/100, fmt.Sprintf("%s... %d%%", cfg.downloading(), pct))
	}); err != nil {
		fatal(cfg.title(), "Download failed. Check that this PC can reach the server.\n"+err.Error())
	}

	writeProgress(progressFile, 52, cfg.installing()+"...")
	if err := installAgent(api, code, packageZip, dataDir, func(pct int, msg string) {
		if msg == "" {
			msg = cfg.installing() + "..."
		}
		writeProgress(progressFile, pct, msg)
	}); err != nil {
		fatal(cfg.title(), "Setup failed. See %ProgramData%\\NexusDesk\\Agent\\install.log\n"+err.Error())
	}

	writeProgress(progressFile, 100, cfg.finished())
	// Keep the branded progress window on screen briefly so the finish state is visible.
	time.Sleep(2200 * time.Millisecond)
}

func installAgent(api, code, packageZip, dataDir string, progress func(int, string)) error {
	logPath := filepath.Join(dataDir, "install.log")
	logf := func(msg string) {
		line := fmt.Sprintf("[%s] %s\r\n", time.Now().Format(time.RFC3339), msg)
		f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err == nil {
			_, _ = f.WriteString(line)
			_ = f.Close()
		}
	}

	installRoot := filepath.Join(os.Getenv("ProgramFiles"), "NexusDesk", "Agent")
	appDir := filepath.Join(installRoot, "app")
	stagingDir := filepath.Join(installRoot, "app-staging")
	_ = os.MkdirAll(installRoot, 0o755)
	_ = os.MkdirAll(dataDir, 0o755)

	progress(54, "Preparing...")
	logf("Setup starting (GUI installer, no console)")
	stopNexusdeskNode()
	time.Sleep(1200 * time.Millisecond)

	_ = os.Remove(filepath.Join(dataDir, "state.json"))
	_ = os.Remove(filepath.Join(dataDir, "tokens.enc"))
	_ = os.Remove(filepath.Join(dataDir, "setup.complete"))
	_ = os.Remove(filepath.Join(dataDir, "setup.failed"))

	progress(58, "Preparing files...")
	if err := removeDirRetry(appDir); err != nil {
		logf("clear app: " + err.Error())
	}
	if err := removeDirRetry(stagingDir); err != nil {
		logf("clear staging: " + err.Error())
	}

	progress(64, "Extracting files...")
	logf("Extracting package")
	if err := os.MkdirAll(stagingDir, 0o755); err != nil {
		return err
	}
	if err := unzip(packageZip, stagingDir); err != nil {
		return fmt.Errorf("extract failed: %w", err)
	}

	progress(78, "Configuring...")
	_ = removeDirRetry(appDir)
	if err := os.Rename(stagingDir, appDir); err != nil {
		return fmt.Errorf("activate install: %w", err)
	}

	nodeExe := filepath.Join(appDir, "runtime", "node", "node.exe")
	if _, err := os.Stat(nodeExe); err != nil {
		nodeExe, err = findFile(filepath.Join(appDir, "runtime", "node"), "node.exe")
		if err != nil {
			nodeExe, err = findFile(appDir, "node.exe")
			if err != nil {
				return err
			}
		}
	}
	mainJs := filepath.Join(appDir, "dist", "main.js")
	if _, err := os.Stat(mainJs); err != nil {
		mainJs, err = findFile(filepath.Join(appDir, "dist"), "main.js")
		if err != nil {
			return fmt.Errorf("agent main.js not found")
		}
	}

	wsURL := strings.Replace(api, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	envFile := filepath.Join(dataDir, "agent.env")
	envBody := strings.Join([]string{
		"API_URL=" + api,
		"WS_URL=" + wsURL,
		"AGENT_ENROLLMENT_TOKEN=" + code,
		"GUEST_CODE=" + code,
		"NODE_ENV=production",
		"LOG_LEVEL=info",
		"NEXUSDESK_AGENT_DATA_DIR=" + dataDir,
		"",
	}, "\r\n")
	if err := os.WriteFile(envFile, []byte(envBody), 0o644); err != nil {
		return err
	}

	logFile := filepath.Join(dataDir, "agent.log")
	_ = os.Remove(logFile)
	wrapper := filepath.Join(installRoot, "run-agent.cmd")
	wrapperBody := "@echo off\r\nsetlocal\r\n" +
		"for /f \"usebackq tokens=1,* delims==\" %%A in (\"" + envFile + "\") do set \"%%A=%%B\"\r\n" +
		"\"" + nodeExe + "\" \"" + mainJs + "\" >> \"" + logFile + "\" 2>&1\r\n"
	if err := os.WriteFile(wrapper, []byte(wrapperBody), 0o755); err != nil {
		return err
	}

	// Do not create a Windows scheduled task here — antivirus products often flag
	// `schtasks /Create` as suspicious and block the installer mid-setup.
	// Start the agent for this session only (run-agent.cmd remains for manual relaunch).

	progress(86, "Starting...")
	logf("Starting agent")
	cmd := exec.Command(nodeExe, mainJs)
	cmd.Dir = filepath.Dir(mainJs)
	cmd.Env = append(os.Environ(),
		"API_URL="+api,
		"WS_URL="+wsURL,
		"AGENT_ENROLLMENT_TOKEN="+code,
		"GUEST_CODE="+code,
		"NODE_ENV=production",
		"LOG_LEVEL=info",
		"NEXUSDESK_AGENT_DATA_DIR="+dataDir,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start agent: %w", err)
	}

	progress(90, "Finishing setup...")
	stateFile := filepath.Join(dataDir, "state.json")
	deadline := time.Now().Add(90 * time.Second)
	for i := 0; time.Now().Before(deadline); i++ {
		pct := 90 + (i / 5)
		if pct > 98 {
			pct = 98
		}
		progress(pct, "Finishing setup...")
		if data, err := os.ReadFile(stateFile); err == nil && bytes.Contains(data, []byte(`"deviceId"`)) {
			logf("Enrolled OK")
			_ = os.WriteFile(filepath.Join(dataDir, "setup.complete"), []byte(time.Now().Format(time.RFC3339)), 0o644)
			progress(100, "Complete")
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("enrollment failed — agent did not register with the server")
}

func stopNexusdeskNode() {
	// Best-effort: stop prior agent without opening a window.
	_ = runHidden("taskkill", "/F", "/IM", "node.exe", "/FI", "WINDOWTITLE eq NexusDesk*")
	// Also try stopping by image path via wmic (hidden).
	_ = runHidden("cmd", "/C", `for /f "tokens=2 delims==" %A in ('wmic process where "name='node.exe' and CommandLine like '%%NexusDesk%%'" get ProcessId /value ^| find "="') do taskkill /F /PID %A`)
}

func runHidden(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd.Run()
}

func removeDirRetry(path string) error {
	var last error
	for i := 0; i < 8; i++ {
		_ = runHidden("cmd", "/C", "rmdir /s /q \""+path+"\"")
		if _, err := os.Stat(path); os.IsNotExist(err) {
			return nil
		}
		last = fmt.Errorf("still exists: %s", path)
		time.Sleep(time.Duration(200*(i+1)) * time.Millisecond)
	}
	return last
}

func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		target := filepath.Join(dest, f.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(dest)+string(os.PathSeparator)) &&
			filepath.Clean(target) != filepath.Clean(dest) {
			return fmt.Errorf("illegal path in zip: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(target, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		_ = out.Close()
		_ = rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func findFile(root, name string) (string, error) {
	var found string
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.EqualFold(info.Name(), name) {
			found = path
			return io.EOF
		}
		return nil
	})
	if found == "" {
		return "", fmt.Errorf("%s not found in package", name)
	}
	return found, nil
}

func writeProgress(path string, pct int, msg string) {
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	_ = os.WriteFile(path, []byte(fmt.Sprintf("%d|%s", pct, msg)), 0o644)
}

func parseAccent(hex string) (int, int, int) {
	h := strings.TrimPrefix(strings.TrimSpace(hex), "#")
	if len(h) != 6 {
		return 11, 92, 255
	}
	var n uint64
	fmt.Sscanf(h, "%x", &n)
	return int((n >> 16) & 0xff), int((n >> 8) & 0xff), int(n & 0xff)
}

func startProgressUI(title, brand, accentHex, progressFile string) *exec.Cmd {
	esc := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	r, g, b := parseAccent(accentHex)
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$progressFile = '%s'
$title = '%s'
$brand = '%s'
$accent = [System.Drawing.Color]::FromArgb(%d, %d, %d)
$form = New-Object System.Windows.Forms.Form
$form.Text = $title
$form.Width = 480
$form.Height = 210
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$brandLabel = New-Object System.Windows.Forms.Label
$brandLabel.Left = 24; $brandLabel.Top = 18; $brandLabel.Width = 420; $brandLabel.Height = 28
$brandLabel.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$brandLabel.ForeColor = $accent
$brandLabel.Text = $brand

$heading = New-Object System.Windows.Forms.Label
$heading.Left = 24; $heading.Top = 52; $heading.Width = 420; $heading.Height = 22
$heading.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$heading.ForeColor = [System.Drawing.Color]::FromArgb(32,33,36)
$heading.Text = $title

$status = New-Object System.Windows.Forms.Label
$status.Left = 24; $status.Top = 84; $status.Width = 360; $status.Height = 20
$status.ForeColor = [System.Drawing.Color]::FromArgb(95,99,104)
$status.Text = 'Preparing...'

$pctLabel = New-Object System.Windows.Forms.Label
$pctLabel.Left = 384; $pctLabel.Top = 84; $pctLabel.Width = 56; $pctLabel.Height = 20
$pctLabel.TextAlign = 'MiddleRight'
$pctLabel.ForeColor = [System.Drawing.Color]::FromArgb(95,99,104)
$pctLabel.Text = '0%%'

$track = New-Object System.Windows.Forms.Panel
$track.Left = 24; $track.Top = 114; $track.Width = 416; $track.Height = 10
$track.BackColor = [System.Drawing.Color]::FromArgb(232,234,237)

$fill = New-Object System.Windows.Forms.Panel
$fill.Left = 0; $fill.Top = 0; $fill.Width = 0; $fill.Height = 10
$fill.BackColor = $accent
$track.Controls.Add($fill)

$hint = New-Object System.Windows.Forms.Label
$hint.Left = 24; $hint.Top = 136; $hint.Width = 416; $hint.Height = 20
$hint.ForeColor = [System.Drawing.Color]::FromArgb(154,160,166)
$hint.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$hint.Text = 'Please keep this window open until setup completes.'

$form.Controls.AddRange(@($brandLabel,$heading,$status,$pctLabel,$track,$hint))

function Set-ProgressUI([int]$pct, [string]$msg) {
  if ($pct -lt 0) { $pct = 0 }
  if ($pct -gt 100) { $pct = 100 }
  $fill.Width = [Math]::Max(0, [int](($track.Width * $pct) / 100))
  $pctLabel.Text = ($pct.ToString() + '%%')
  if ($msg) { $status.Text = $msg }
  if ($pct -ge 100) {
    $status.ForeColor = $accent
    $hint.Text = 'You can close this window.'
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
  try {
    if (Test-Path -LiteralPath $progressFile) {
      $raw = [IO.File]::ReadAllText($progressFile).Trim()
      if ($raw) {
        $parts = $raw.Split('|', 2)
        $pct = 0
        [void][int]::TryParse($parts[0], [ref]$pct)
        $msg = if ($parts.Length -gt 1) { $parts[1] } else { '' }
        Set-ProgressUI $pct $msg
        if ($pct -ge 100) {
          $timer.Stop()
          Start-Sleep -Milliseconds 1800
          $form.Close()
        }
      }
    }
  } catch {}
})
$timer.Start()
$form.Add_FormClosed({ $timer.Stop() })
[System.Windows.Forms.Application]::Run($form)
`, esc(progressFile), esc(title), esc(brand), r, g, b)

	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile", "-NoLogo", "-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden",
		"-Command", script,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
	time.Sleep(500 * time.Millisecond)
	return cmd
}

func stopProgressUI(cmd *exec.Cmd, progressFile string) {
	writeProgress(progressFile, 100, "Complete")
	if cmd == nil || cmd.Process == nil {
		return
	}
	done := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		_ = cmd.Process.Kill()
	}
	_ = os.Remove(progressFile)
}

func loadConfig() (config, error) {
	exe, err := os.Executable()
	if err != nil {
		return config{}, err
	}
	data, err := os.ReadFile(exe)
	if err != nil {
		return config{}, err
	}
	idx := bytes.LastIndex(data, []byte(marker))
	if idx < 0 {
		return config{}, fmt.Errorf("missing embed marker")
	}
	raw := bytes.TrimSpace(data[idx+len(marker):])
	var cfg config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return config{}, err
	}
	return cfg, nil
}

type progressFn func(pct int)

func download(url, dest string, onProgress progressFn) error {
	client := &http.Client{Timeout: 20 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	var written int64
	total := resp.ContentLength
	buf := make([]byte, 32*1024)
	lastPct := -1
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, err := f.Write(buf[:n]); err != nil {
				return err
			}
			written += int64(n)
			if onProgress != nil && total > 0 {
				pct := int(written * 100 / total)
				if pct != lastPct {
					lastPct = pct
					onProgress(pct)
				}
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	if onProgress != nil {
		onProgress(100)
	}
	return nil
}

func fatal(title, msg string) {
	_ = messageBox(title, msg, 0x10)
	os.Exit(1)
}

func isElevated() bool {
	cmd := exec.Command("net", "session")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd.Run() == nil
}

func relaunchElevated() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(exe)
	cwd, _ := syscall.UTF16PtrFromString(filepath.Dir(exe))
	var show int32 = 1
	return shellExecute(verb, file, nil, cwd, show)
}

func shellExecute(verb, file, params, cwd *uint16, show int32) error {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	proc := shell32.NewProc("ShellExecuteW")
	r, _, err := proc.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(params)),
		uintptr(unsafe.Pointer(cwd)),
		uintptr(show),
	)
	if r <= 32 {
		if err != nil {
			return err
		}
		return fmt.Errorf("ShellExecute failed (%d)", r)
	}
	return nil
}

func messageBox(title, text string, flags uint) error {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(flags))
	return nil
}
