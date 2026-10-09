#include "shell.hpp"

namespace frame {
class Command final : public IExplorerCommand {
  std::atomic<ULONG> references{1};
  bool edit;
public:
  explicit Command(bool value) : edit(value) { ++objects; }
  ~Command() { --objects; }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** result) override {
    if (!result) return E_POINTER; *result = nullptr;
    if (iid == IID_IUnknown || iid == IID_IExplorerCommand) { *result = static_cast<IExplorerCommand*>(this); AddRef(); return S_OK; }
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
  ULONG STDMETHODCALLTYPE Release() override { const auto count = --references; if (!count) delete this; return count; }
  HRESULT STDMETHODCALLTYPE GetTitle(IShellItemArray*, PWSTR* title) override { return SHStrDupW(edit ? L"Edit in Frame" : L"Convert in Frame", title); }
  HRESULT STDMETHODCALLTYPE GetIcon(IShellItemArray*, PWSTR* icon) override {
    if (!icon) return E_POINTER; *icon = nullptr;
    wchar_t path[32768]; const auto length = GetModuleFileNameW(module, path, 32768);
    if (!length || length >= 32768) return E_FAIL;
    try { return SHStrDupW((std::wstring(path, length) + L",-101").c_str(), icon); } catch (...) { return E_OUTOFMEMORY; }
  }
  HRESULT STDMETHODCALLTYPE GetToolTip(IShellItemArray*, PWSTR* tooltip) override { if (!tooltip) return E_POINTER; *tooltip = nullptr; return E_NOTIMPL; }
  HRESULT STDMETHODCALLTYPE GetCanonicalName(GUID* id) override { if (!id) return E_POINTER; *id = edit ? editClsid : convertClsid; return S_OK; }
  HRESULT STDMETHODCALLTYPE GetState(IShellItemArray* items, BOOL slow, EXPCMDSTATE* state) override {
    if (!state) return E_POINTER; *state = ECS_HIDDEN;
    if (!enabled() || !items) return S_OK;
    DWORD count = 0; if (FAILED(items->GetCount(&count))) return S_OK;
    if (!slow && count > 32 && count <= 2000) return E_PENDING;
    try { std::vector<std::wstring> paths; if (SUCCEEDED(selectedPaths(items, paths))) *state = ECS_ENABLED; return S_OK; }
    catch (...) { return E_OUTOFMEMORY; }
  }
  HRESULT STDMETHODCALLTYPE Invoke(IShellItemArray* items, IBindCtx*) override {
    try { std::vector<std::wstring> paths; const auto status = selectedPaths(items, paths); return FAILED(status) ? status : launch(paths, edit); }
    catch (...) { return E_OUTOFMEMORY; }
  }
  HRESULT STDMETHODCALLTYPE GetFlags(EXPCMDFLAGS* flags) override { if (!flags) return E_POINTER; *flags = ECF_DEFAULT; return S_OK; }
  HRESULT STDMETHODCALLTYPE EnumSubCommands(IEnumExplorerCommand** commands) override { if (!commands) return E_POINTER; *commands = nullptr; return E_NOTIMPL; }
};
HRESULT createCommand(bool edit, REFIID iid, void** result) {
  const auto command = new (std::nothrow) Command(edit); if (!command) return E_OUTOFMEMORY;
  const auto status = command->QueryInterface(iid, result); command->Release(); return status;
}
}
