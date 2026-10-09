#include "shell.hpp"

namespace frame {
HMODULE module = nullptr;
std::atomic<long> objects{0};
class Factory final : public IClassFactory {
  std::atomic<ULONG> references{1};
  bool edit;
public:
  explicit Factory(bool value) : edit(value) { ++objects; }
  ~Factory() { --objects; }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** result) override {
    if (!result) return E_POINTER; *result = nullptr;
    if (iid == IID_IUnknown || iid == IID_IClassFactory) { *result = static_cast<IClassFactory*>(this); AddRef(); return S_OK; }
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
  ULONG STDMETHODCALLTYPE Release() override { const auto count = --references; if (!count) delete this; return count; }
  HRESULT STDMETHODCALLTYPE CreateInstance(IUnknown* outer, REFIID iid, void** result) override { if (outer) return CLASS_E_NOAGGREGATION; return createCommand(edit, iid, result); }
  HRESULT STDMETHODCALLTYPE LockServer(BOOL lock) override { objects += lock ? 1 : -1; return S_OK; }
};
}
extern "C" BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) { frame::module = instance; DisableThreadLibraryCalls(instance); }
  return TRUE;
}
extern "C" __declspec(dllexport) HRESULT WINAPI DllCanUnloadNow() { return frame::objects == 0 ? S_OK : S_FALSE; }
extern "C" __declspec(dllexport) HRESULT WINAPI DllGetClassObject(REFCLSID clsid, REFIID iid, void** result) {
  if (!result) return E_POINTER; *result = nullptr;
  if (clsid != frame::editClsid && clsid != frame::convertClsid) return CLASS_E_CLASSNOTAVAILABLE;
  const auto factory = new (std::nothrow) frame::Factory(clsid == frame::editClsid); if (!factory) return E_OUTOFMEMORY;
  const auto status = factory->QueryInterface(iid, result); factory->Release(); return status;
}
