#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shobjidl.h>
#include <shlwapi.h>
#include <atomic>
#include <string>
#include <vector>
#include <new>
#include "frame-config.h"

namespace frame {
extern HMODULE module;
extern std::atomic<long> objects;
HRESULT selectedPaths(IShellItemArray* items, std::vector<std::wstring>& paths);
HRESULT launch(const std::vector<std::wstring>& paths, bool edit);
bool enabled();
HRESULT createCommand(bool edit, REFIID iid, void** result);
template <typename T> struct ComPtr {
  T* value = nullptr;
  ~ComPtr() { if (value) value->Release(); }
};
}
