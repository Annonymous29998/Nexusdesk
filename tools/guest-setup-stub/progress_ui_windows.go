package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	wmDestroy   = 0x0002
	wmClose     = 0x0010
	wmTimer     = 0x0113
	wmSetText   = 0x000C
	wmQuit      = 0x0012
	pbmSetRange = 0x0401
	pbmSetPos   = 0x0402
	pbmSetBar   = 0x0409

	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsExTopmost        = 0x00000008
	wsExAppWindow      = 0x00040000

	swShow     = 5
	swShowNA   = 8
	cwUseDefault = 0x80000000

	iccProgress = 0x00000020
	timerPoll   = 1
)

var (
	progUser32   = syscall.NewLazyDLL("user32.dll")
	progKernel32 = syscall.NewLazyDLL("kernel32.dll")
	progComctl32 = syscall.NewLazyDLL("comctl32.dll")

	procRegisterClassExW = progUser32.NewProc("RegisterClassExW")
	procCreateWindowExW  = progUser32.NewProc("CreateWindowExW")
	procDefWindowProcW   = progUser32.NewProc("DefWindowProcW")
	procGetMessageW      = progUser32.NewProc("GetMessageW")
	procTranslateMessage = progUser32.NewProc("TranslateMessage")
	procDispatchMessageW = progUser32.NewProc("DispatchMessageW")
	procPostQuitMessage  = progUser32.NewProc("PostQuitMessage")
	procShowWindow       = progUser32.NewProc("ShowWindow")
	procUpdateWindow     = progUser32.NewProc("UpdateWindow")
	procSendMessageW     = progUser32.NewProc("SendMessageW")
	procSetTimer         = progUser32.NewProc("SetTimer")
	procKillTimer        = progUser32.NewProc("KillTimer")
	procDestroyWindow    = progUser32.NewProc("DestroyWindow")
	procGetModuleHandleW = progKernel32.NewProc("GetModuleHandleW")
	procInitCommonControlsEx = progComctl32.NewProc("InitCommonControlsEx")

	progressClassAtom uint16
	progressUIInst    *nativeProgressUI
)

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   syscall.Handle
	Icon       syscall.Handle
	Cursor     syscall.Handle
	Background syscall.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     syscall.Handle
}

type msg struct {
	Hwnd    syscall.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      struct {
		X, Y int32
	}
}

type iccEx struct {
	Size uint32
	ICC  uint32
}

type nativeProgressUI struct {
	hwnd, brandHwnd, statusHwnd, pctHwnd, barHwnd syscall.Handle
	progressFile                                   string
	ready                                          int32
	closeCh                                        chan struct{}
}

func startNativeProgressUI(title, brand, accentHex, progressFile string) *nativeProgressUI {
	ui := &nativeProgressUI{
		progressFile: progressFile,
		closeCh:      make(chan struct{}),
	}
	progressUIInst = ui
	go ui.run(title, brand, accentHex)
	deadline := time.Now().Add(800 * time.Millisecond)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(&ui.ready) == 1 {
			return ui
		}
		time.Sleep(5 * time.Millisecond)
	}
	return ui
}

func (ui *nativeProgressUI) stop() {
	select {
	case <-ui.closeCh:
		return
	default:
		close(ui.closeCh)
	}
	if ui.hwnd != 0 {
		procPostQuitMessage.Call(0)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(&ui.ready) == 0 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func (ui *nativeProgressUI) run(title, brand, accentHex string) {
	if err := initProgressCommonControls(); err != nil {
		return
	}
	hInst, _, _ := procGetModuleHandleW.Call(0)
	className, _ := syscall.UTF16PtrFromString("NexusDeskSetupProgress")
	if progressClassAtom == 0 {
		wc := wndClassEx{
			Size:      uint32(unsafe.Sizeof(wndClassEx{})),
			WndProc:   syscall.NewCallback(progressWndProc),
			Instance:  syscall.Handle(hInst),
			ClassName: className,
		}
		atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
		if atom == 0 {
			return
		}
		progressClassAtom = uint16(atom)
	}

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	hwnd, _, _ := procCreateWindowExW.Call(
		wsExTopmost|wsExAppWindow,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(titlePtr)),
		wsOverlappedWindow,
		0x80000000, 0x80000000, 480, 210,
		0, 0, hInst, 0,
	)
	ui.hwnd = syscall.Handle(hwnd)
	if ui.hwnd == 0 {
		return
	}

	ui.brandHwnd = createStatic(ui.hwnd, brand, 24, 18, 420, 28, true)
	ui.statusHwnd = createStatic(ui.hwnd, "Preparing...", 24, 84, 360, 20, false)
	ui.pctHwnd = createStatic(ui.hwnd, "0%", 384, 84, 56, 20, false)
	createStatic(ui.hwnd, "Please keep this window open until setup completes.", 24, 136, 416, 20, false)

	barClass, _ := syscall.UTF16PtrFromString("msctls_progress32")
	barHwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(barClass)),
		0,
		wsChild|wsVisible,
		24, 114, 416, 12,
		uintptr(ui.hwnd), 0, hInst, 0,
	)
	ui.barHwnd = syscall.Handle(barHwnd)
	if ui.barHwnd != 0 {
		procSendMessageW.Call(uintptr(ui.barHwnd), pbmSetRange, 0, uintptr(100<<16))
		r, g, b := parseAccent(accentHex)
		color := uintptr(b<<16 | g<<8 | r)
		procSendMessageW.Call(uintptr(ui.barHwnd), pbmSetBar, 0, color)
	}

	procShowWindow.Call(uintptr(ui.hwnd), swShow)
	procUpdateWindow.Call(uintptr(ui.hwnd))
	atomic.StoreInt32(&ui.ready, 1)
	ui.refresh()
	procSetTimer.Call(uintptr(ui.hwnd), timerPoll, 80, 0)

	var m msg
	for {
		select {
		case <-ui.closeCh:
			procKillTimer.Call(uintptr(ui.hwnd), timerPoll)
			procDestroyWindow.Call(uintptr(ui.hwnd))
			atomic.StoreInt32(&ui.ready, 0)
			return
		default:
		}
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(ret) <= 0 {
			atomic.StoreInt32(&ui.ready, 0)
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func progressWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	ui := progressUIInst
	switch msg {
	case wmTimer:
		if ui != nil && wParam == timerPoll {
			ui.refresh()
		}
		return 0
	case wmClose:
		procPostQuitMessage.Call(0)
		return 0
	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

func (ui *nativeProgressUI) refresh() {
	if ui.progressFile == "" {
		return
	}
	data, err := os.ReadFile(ui.progressFile)
	if err != nil || len(data) == 0 {
		return
	}
	parts := strings.SplitN(strings.TrimSpace(string(data)), "|", 2)
	pct := 0
	if n, err := strconv.Atoi(parts[0]); err == nil {
		pct = n
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	status := "Preparing..."
	if len(parts) > 1 && strings.TrimSpace(parts[1]) != "" {
		status = strings.TrimSpace(parts[1])
	}
	if ui.barHwnd != 0 {
		procSendMessageW.Call(uintptr(ui.barHwnd), pbmSetPos, uintptr(pct), 0)
	}
	setControlText(ui.statusHwnd, status)
	setControlText(ui.pctHwnd, fmt.Sprintf("%d%%", pct))
	if pct >= 100 {
		procKillTimer.Call(uintptr(ui.hwnd), timerPoll)
		time.AfterFunc(1200*time.Millisecond, func() {
			procPostQuitMessage.Call(0)
		})
	}
}

func createStatic(parent syscall.Handle, text string, x, y, w, h int32, bold bool) syscall.Handle {
	class, _ := syscall.UTF16PtrFromString("STATIC")
	label, _ := syscall.UTF16PtrFromString(text)
	style := wsChild | wsVisible | 0x00000000 // SS_LEFT
	if bold {
		style |= 0
	}
	hInst, _, _ := procGetModuleHandleW.Call(0)
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(class)),
		uintptr(unsafe.Pointer(label)),
		uintptr(style),
		uintptr(x), uintptr(y), uintptr(w), uintptr(h),
		uintptr(parent), 0, hInst, 0,
	)
	return syscall.Handle(hwnd)
}

func setControlText(hwnd syscall.Handle, text string) {
	if hwnd == 0 {
		return
	}
	p, _ := syscall.UTF16PtrFromString(text)
	procSendMessageW.Call(uintptr(hwnd), wmSetText, 0, uintptr(unsafe.Pointer(p)))
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

func initProgressCommonControls() error {
	icc := iccEx{Size: uint32(unsafe.Sizeof(iccEx{})), ICC: iccProgress}
	r, _, err := procInitCommonControlsEx.Call(uintptr(unsafe.Pointer(&icc)))
	if r == 0 {
		if err != nil && err.Error() != "The operation completed successfully." {
			return err
		}
		return fmt.Errorf("InitCommonControlsEx failed")
	}
	return nil
}
