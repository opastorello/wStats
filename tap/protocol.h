// Shared-memory protocol between wStats (Rust) and the code inside explorer.exe.
// Mirrored in src-tauri/src/strip/xaml.rs.
// The header is APPEND-ONLY: the stub DLL stays loaded in Explorer across wStats updates
// and checks `version`, so existing fields never move. Bump VERSION only for a break.
#pragma once
#include <cstdint>

namespace wstats
{
constexpr wchar_t kMappingName[] = L"Local\\wStats.Strip.v1";
constexpr wchar_t kReloadEvent[] = L"Local\\wStats.TapReload.v1";
constexpr uint32_t kMagic = 0x50545377; // "wSTP"
constexpr uint32_t kVersion = 1;
constexpr uint32_t kHeaderSize = 4096;
constexpr uint32_t kMaxPixels = 4096 * 512; // width * height, 8 MB of BGRA
constexpr uint32_t kMappingSize = kHeaderSize + kMaxPixels * 4;

// Messages posted to `hostHwnd`. wParam = event, lParam = MAKELPARAM(x, y) in element pixels.
constexpr unsigned kMsgPointer = 0x8000 + 20; // WM_APP + 20
enum PointerEvent : uint32_t
{
    Move = 1,
    Leave = 2,
    LeftClick = 3,
    RightClick = 4,
};

enum Position : uint32_t
{
    Left = 0,  // between the Widgets button and Start
    Right = 1, // next to the notification area
};

#pragma pack(push, 4)
struct Header
{
    // Written by wStats.
    uint32_t magic;
    uint32_t version;
    volatile long seq; // seqlock: odd while pixels are being written
    uint32_t width;    // pixels
    uint32_t height;   // pixels
    uint32_t position; // Position
    uint64_t hostHwnd; // where pointer messages go
    wchar_t corePath[260];

    // Written by the code in explorer.exe.
    volatile long heartbeat; // increments on every tick while attached
    uint32_t tapPid;
    int32_t elemX; // element top-left, in taskbar-window pixels
    int32_t elemY;
    uint32_t attached; // frames currently hosting the element

    // Written by wStats: the monitor whose taskbar hosts the element (physical pixels,
    // as GetMonitorInfo reports it). All zero means the primary monitor.
    int32_t monLeft;
    int32_t monTop;
    int32_t monRight;
    int32_t monBottom;

    // Written by wStats: 1 = show on every taskbar instead of the one above.
    uint32_t allMonitors;
    // Written by wStats: DPI scale the pixels were rendered at, x1000. Elements on other
    // monitors keep the same size in DIPs (the bitmap is resampled there).
    uint32_t renderScale1000;
    // Written by the code in explorer.exe on a click: DPI scale of the clicked taskbar,
    // x1000, so wStats can turn render pixels into that monitor's pixels.
    uint32_t clickScale1000;

    // Written by the code in explorer.exe: incremented each time a core is loaded (and
    // `attached` reset with it), so wStats can tell the new core apart from the old one.
    volatile long coreLoads;
};
#pragma pack(pop)

static_assert(sizeof(Header) <= kHeaderSize);
} // namespace wstats
