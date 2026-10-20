// Dev-only: injects a TAP DLL into the taskbar's explorer.exe. The app does this itself
// in Rust; this tool exists to iterate on the DLL without rebuilding the app.
#include <windows.h>
#include <cstdio>

using InitializeXamlDiagnosticsEx_t = HRESULT(WINAPI*)(LPCWSTR, DWORD, LPCWSTR, LPCWSTR, CLSID, LPCWSTR);
static constexpr CLSID CLSID_WStatsTap = {0x02282dab, 0x1933, 0x4e15, {0xaf, 0x04, 0x8c, 0x5a, 0x60, 0xd0, 0x7f, 0xe7}};

int wmain(int argc, wchar_t** argv)
{
    if (argc < 2) { wprintf(L"usage: inject <dll path>\n"); return 1; }
    DWORD pid = 0;
    GetWindowThreadProcessId(FindWindowW(L"Shell_TrayWnd", nullptr), &pid);
    HMODULE xaml = LoadLibraryExW(L"Windows.UI.Xaml.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    auto init = reinterpret_cast<InitializeXamlDiagnosticsEx_t>(GetProcAddress(xaml, "InitializeXamlDiagnosticsEx"));
    if (!pid || !init) { wprintf(L"no explorer or no XAML diagnostics\n"); return 2; }
    HRESULT hr = E_FAIL;
    for (int i = 1; i <= 100; i++)
    {
        wchar_t endpoint[64];
        swprintf_s(endpoint, L"VisualDiagConnection%d", i);
        hr = init(endpoint, pid, L"", argv[1], CLSID_WStatsTap, L"");
        if (hr != HRESULT_FROM_WIN32(ERROR_NOT_FOUND)) break;
    }
    wprintf(L"pid %lu hr=0x%08X\n", pid, hr);
    return SUCCEEDED(hr) ? 0 : 3;
}
