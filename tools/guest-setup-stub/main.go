// Windows guest enroll launcher. Built once; API appends JSON config after a marker.
package main

import (
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
	marker           = "NDGUESTCFG\x00"
	createNoWindow   = 0x08000000
	progressPollMs   = 400
)

type config struct {
	APIURL      string `json:"apiUrl"`
	GuestCode   string `json:"guestCode"`
	Title       string `json:"title"`
	Downloading string `json:"downloading"`
	Finished    string `json:"finished"`
}

func (c config) title() string {
	if strings.TrimSpace(c.Title) != "" {
		return c.Title
	}
	return "Setup"
}

func (c config) downloading() string {
	if strings.TrimSpace(c.Downloading) != "" {
		return c.Downloading
	}
	return "Downloading components...\nPlease wait."
}

func (c config) finished() string {
	if strings.TrimSpace(c.Finished) != "" {
		return c.Finished
	}
	return "Finished. You can close this window."
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
	setupPs1 := filepath.Join(dataDir, "nd-setup.ps1")

	publicDir := filepath.Join(os.Getenv("PUBLIC"), "NexusDesk")
	_ = os.MkdirAll(publicDir, 0o755)
	progressFile := filepath.Join(publicDir, "setup-progress-"+code+".txt")
	_ = os.Remove(progressFile)
	writeProgress(progressFile, 5, firstLine(cfg.downloading()))

	// WinForms progress UI (no console). Setup PowerShell runs fully hidden.
	progressCmd := startProgressUI(cfg.title(), progressFile)
	defer stopProgressUI(progressCmd, progressFile)

	writeProgress(progressFile, 12, "Downloading package...")
	if err := download(api+"/guest/"+code+"/agent-package.zip", packageZip, func(pct int) {
		// Map download 0–100 into overall 12–48
		writeProgress(progressFile, 12+pct*36/100, "Downloading package...")
	}); err != nil {
		fatal(cfg.title(), "Download failed. Check that this PC can reach the server.\n"+err.Error())
	}

	writeProgress(progressFile, 50, "Preparing setup...")
	if err := download(api+"/guest/"+code+"/windows.ps1?v=15", setupPs1, nil); err != nil {
		fatal(cfg.title(), "Could not download setup script.\n"+err.Error())
	}

	writeProgress(progressFile, 55, "Installing...")
	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile",
		"-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden",
		"-File", setupPs1,
	)
	cmd.Env = append(os.Environ(),
		"ND_API_URL="+api,
		"ND_GUEST_CODE="+code,
		"ND_PACKAGE_ZIP="+packageZip,
		"NEXUSDESK_AGENT_DATA_DIR="+dataDir,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		fatal(cfg.title(), "Setup failed. See %ProgramData%\\NexusDesk\\Agent\\install.log\n"+string(out)+"\n"+err.Error())
	}

	writeProgress(progressFile, 100, "Finished")
	time.Sleep(500 * time.Millisecond)
	_ = messageBox(cfg.title(), cfg.finished(), 0x40)
}

func firstLine(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return strings.TrimSpace(s)
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

func startProgressUI(title, progressFile string) *exec.Cmd {
	esc := func(s string) string { return strings.ReplaceAll(s, "'", "''") }
	script := fmt.Sprintf(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$progressFile = '%s'
$title = '%s'
$form = New-Object System.Windows.Forms.Form
$form.Text = $title
$form.Width = 460
$form.Height = 168
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.BackColor = [System.Drawing.Color]::White
$heading = New-Object System.Windows.Forms.Label
$heading.Left = 18
$heading.Top = 14
$heading.Width = 410
$heading.Height = 22
$heading.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$heading.Text = $title
$label = New-Object System.Windows.Forms.Label
$label.Left = 18
$label.Top = 42
$label.Width = 340
$label.Height = 22
$label.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$label.ForeColor = [System.Drawing.Color]::FromArgb(80,80,80)
$label.Text = 'Preparing...'
$pctLabel = New-Object System.Windows.Forms.Label
$pctLabel.Left = 360
$pctLabel.Top = 42
$pctLabel.Width = 60
$pctLabel.Height = 22
$pctLabel.TextAlign = 'MiddleRight'
$pctLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$pctLabel.ForeColor = [System.Drawing.Color]::FromArgb(80,80,80)
$pctLabel.Text = '0%%'
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Left = 18
$bar.Top = 74
$bar.Width = 404
$bar.Height = 18
$bar.Minimum = 0
$bar.Maximum = 100
$bar.Style = 'Continuous'
$hint = New-Object System.Windows.Forms.Label
$hint.Left = 18
$hint.Top = 102
$hint.Width = 404
$hint.Height = 18
$hint.Font = New-Object System.Drawing.Font('Segoe UI', 8)
$hint.ForeColor = [System.Drawing.Color]::FromArgb(140,140,140)
$hint.Text = 'Please keep this window open until setup completes.'
$form.Controls.Add($heading)
$form.Controls.Add($label)
$form.Controls.Add($pctLabel)
$form.Controls.Add($bar)
$form.Controls.Add($hint)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 300
$timer.Add_Tick({
  try {
    if (Test-Path -LiteralPath $progressFile) {
      $raw = [IO.File]::ReadAllText($progressFile).Trim()
      if ($raw) {
        $parts = $raw.Split('|', 2)
        $pct = 0
        [void][int]::TryParse($parts[0], [ref]$pct)
        if ($pct -lt 0) { $pct = 0 }
        if ($pct -gt 100) { $pct = 100 }
        $bar.Value = $pct
        $pctLabel.Text = ($pct.ToString() + '%%')
        if ($parts.Length -gt 1 -and $parts[1]) { $label.Text = $parts[1] }
        if ($pct -ge 100) { $timer.Stop(); $form.Close() }
      }
    }
  } catch {}
})
$timer.Start()
$form.Add_FormClosed({ $timer.Stop() })
[System.Windows.Forms.Application]::Run($form)
`, esc(progressFile), esc(title))

	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile",
		"-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden",
		"-Command", script,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
	time.Sleep(450 * time.Millisecond)
	return cmd
}

func stopProgressUI(cmd *exec.Cmd, progressFile string) {
	writeProgress(progressFile, 100, "Finished")
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
	case <-time.After(3 * time.Second):
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
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
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
