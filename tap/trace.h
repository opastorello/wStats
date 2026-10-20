// Trace for the code inside explorer.exe: %LOCALAPPDATA%\wStats\explorer.log, appended,
// restarted when it passes 256 KB. Explorer gives no other way to see what happened in
// there after the fact.
#pragma once
#include <windows.h>
#include <cstdarg>
#include <cstdio>

namespace wstats
{
inline void Trace(const wchar_t* fmt, ...)
{
    wchar_t path[MAX_PATH];
    DWORD n = GetEnvironmentVariableW(L"LOCALAPPDATA", path, MAX_PATH);
    if (!n || n >= MAX_PATH - 32) return;
    wcscat_s(path, L"\\wStats\\explorer.log");

    wchar_t line[512];
    SYSTEMTIME t;
    GetLocalTime(&t);
    int len = swprintf_s(line, L"%02u:%02u:%02u.%03u %5lu ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds, GetCurrentThreadId());
    if (len < 0) return;
    va_list args;
    va_start(args, fmt);
    int more = _vsnwprintf_s(line + len, _countof(line) - len - 2, _TRUNCATE, fmt, args);
    va_end(args);
    len = more < 0 ? static_cast<int>(wcslen(line)) : len + more;
    line[len++] = L'\n';

    char utf8[1024];
    int bytes = WideCharToMultiByte(CP_UTF8, 0, line, len, utf8, sizeof utf8, nullptr, nullptr);
    if (bytes <= 0) return;

    HANDLE f = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_ALWAYS, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) return;
    LARGE_INTEGER size{};
    if (GetFileSizeEx(f, &size) && size.QuadPart > 256 * 1024)
    {
        CloseHandle(f);
        f = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, CREATE_ALWAYS, 0, nullptr);
        if (f == INVALID_HANDLE_VALUE) return;
    }
    DWORD written;
    WriteFile(f, utf8, static_cast<DWORD>(bytes), &written, nullptr);
    CloseHandle(f);
}
} // namespace wstats
