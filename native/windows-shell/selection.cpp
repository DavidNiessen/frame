#include "shell.hpp"
#include <cwctype>
#include <memory>

namespace frame {
HRESULT selectedPaths(IShellItemArray* items, std::vector<std::wstring>& paths) {
  if (!items) return E_INVALIDARG;
  DWORD count = 0; HRESULT status = items->GetCount(&count);
  if (FAILED(status)) return status;
  if (!count || count > 2000) return E_INVALIDARG;
  paths.reserve(count);
  for (DWORD index = 0; index < count; ++index) {
    ComPtr<IShellItem> item;
    status = items->GetItemAt(index, &item.value); if (FAILED(status)) return status;
    SFGAOF attributes = 0;
    status = item.value->GetAttributes(SFGAO_FOLDER | SFGAO_FILESYSTEM, &attributes);
    if (FAILED(status) || (attributes & SFGAO_FOLDER) || !(attributes & SFGAO_FILESYSTEM)) return E_INVALIDARG;
    PWSTR raw = nullptr;
    status = item.value->GetDisplayName(SIGDN_FILESYSPATH, &raw); if (FAILED(status)) return status;
    std::unique_ptr<wchar_t, decltype(&CoTaskMemFree)> owner(raw, CoTaskMemFree);
    const std::wstring path(raw);
    const auto dot = path.find_last_of(L'.'), slash = path.find_last_of(L"\\/");
    if (dot == std::wstring::npos || (slash != std::wstring::npos && dot < slash)) return E_INVALIDARG;
    auto extension = path.substr(dot + 1);
    for (auto& character : extension) character = static_cast<wchar_t>(std::towlower(character));
    bool supported = false;
    for (const auto* candidate : extensions) if (extension == candidate) { supported = true; break; }
    if (!supported) return E_INVALIDARG;
    paths.push_back(path);
  }
  return S_OK;
}
}
