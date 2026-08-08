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

const marker = "NDGUESTCFG\x00"

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

	_ = messageBox(cfg.title(), cfg.downloading(), 0x40)

	if err := download(api+"/guest/"+code+"/agent-package.zip", packageZip); err != nil {
		fatal(cfg.title(), "Download failed. Check that this PC can reach the server.\n"+err.Error())
	}
	if err := download(api+"/guest/"+code+"/windows.ps1?v=14", setupPs1); err != nil {
		fatal(cfg.title(), "Could not download setup script.\n"+err.Error())
	}

	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", setupPs1)
	cmd.Env = append(os.Environ(),
		"ND_API_URL="+api,
		"ND_GUEST_CODE="+code,
		"ND_PACKAGE_ZIP="+packageZip,
		"NEXUSDESK_AGENT_DATA_DIR="+dataDir,
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false}
	if out, err := cmd.CombinedOutput(); err != nil {
		fatal(cfg.title(), "Setup failed. See %ProgramData%\\NexusDesk\\Agent\\install.log\n"+string(out)+"\n"+err.Error())
	}

	_ = messageBox(cfg.title(), cfg.finished(), 0x40)
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

func download(url, dest string) error {
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
	_, err = io.Copy(f, resp.Body)
	return err
}

func fatal(title, msg string) {
	_ = messageBox(title, msg, 0x10)
	os.Exit(1)
}

func isElevated() bool {
	cmd := exec.Command("net", "session")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
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
