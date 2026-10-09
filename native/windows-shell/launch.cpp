#include "shell.hpp"
#include "arguments.hpp"
#include <stdexcept>

namespace frame {
static std::wstring setting(const wchar_t* name) {
  DWORD size = 0;
  if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Frame\\ShellActions", name, RRF_RT_REG_SZ, nullptr, nullptr, &size) != ERROR_SUCCESS || size > 131072) return {};
  std::wstring result(size / sizeof(wchar_t), L'\0');
  if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Frame\\ShellActions", name, RRF_RT_REG_SZ, nullptr, result.data(), &size) != ERROR_SUCCESS) return {};
  while (!result.empty() && result.back() == L'\0') result.pop_back();
  return result;
}
bool enabled() {
  DWORD value = 0, size = sizeof(value);
  return RegGetValueW(HKEY_CURRENT_USER, L"Software\\Frame\\ShellActions", L"Enabled", RRF_RT_REG_DWORD, nullptr, &value, &size) == ERROR_SUCCESS && value == 1;
}
HRESULT launch(const std::vector<std::wstring>& paths, bool edit) {
  try {
    const auto executable = setting(L"Executable"), prefix = setting(L"CommandPrefix");
    if (!enabled() || executable.empty() || prefix.empty() || prefix.find(quote(executable)) != 0) return E_ACCESSDENIED;
    // Build all batches before launching; never pass filenames to a shell or expand % variables.
    for (auto command : commands(prefix, paths, edit)) {
      STARTUPINFOW startup = {}; startup.cb = sizeof(startup);
      PROCESS_INFORMATION process = {};
      if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, FALSE, CREATE_UNICODE_ENVIRONMENT, nullptr, nullptr, &startup, &process)) return HRESULT_FROM_WIN32(GetLastError());
      AllowSetForegroundWindow(process.dwProcessId);
      CloseHandle(process.hThread); CloseHandle(process.hProcess);
    }
    return S_OK;
  } catch (const std::length_error&) { return HRESULT_FROM_WIN32(ERROR_FILENAME_EXCED_RANGE); }
  catch (...) { return E_OUTOFMEMORY; }
}
}
