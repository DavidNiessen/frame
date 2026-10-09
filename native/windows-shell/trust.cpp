#include <windows.h>
#include <wincrypt.h>
#include <shellapi.h>
#include <string>
#include <vector>
#include "frame-config.h"

// No caller-selected certificate, store, script, or registry path is accepted.
static bool pinned(PCCERT_CONTEXT certificate) {
  BYTE hash[32]; DWORD size = sizeof(hash);
  return CertGetCertificateContextProperty(certificate, CERT_SHA256_HASH_PROP_ID, hash, &size) &&
    size == sizeof(hash) && memcmp(hash, frame::certificateHash, sizeof(hash)) == 0;
}
static int changeTrust(bool remove) {
  wchar_t module[32768]; const auto length = GetModuleFileNameW(nullptr, module, 32768);
  if (!length || length >= 32768) return ERROR_INVALID_NAME;
  const std::wstring path = std::wstring(module, length).substr(0, std::wstring(module, length).find_last_of(L'\\') + 1) + L"Frame.cer";
  HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return ERROR_FILE_NOT_FOUND;
  const DWORD size = GetFileSize(file, nullptr); DWORD read = 0;
  std::vector<BYTE> bytes(size <= 65536 ? size : 0);
  const bool valid = !bytes.empty() && ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) && read == size;
  CloseHandle(file); if (!valid) return ERROR_INVALID_DATA;
  const auto certificate = CertCreateCertificateContext(X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, bytes.data(), size);
  if (!certificate) return ERROR_INVALID_DATA;
  const bool matches = pinned(certificate);
  const bool current = CertVerifyTimeValidity(nullptr, certificate->pCertInfo) == 0;
  CertFreeCertificateContext(certificate);
  if (!matches || (!remove && !current)) return ERROR_INVALID_DATA;
  const auto store = CertOpenStore(CERT_STORE_PROV_SYSTEM_W, 0, 0, CERT_SYSTEM_STORE_LOCAL_MACHINE, L"TrustedPeople");
  if (!store) return ERROR_ACCESS_DENIED;
  int result = ERROR_SUCCESS;
  if (remove) {
    PCCERT_CONTEXT found = nullptr;
    while ((found = CertEnumCertificatesInStore(store, found))) {
      if (pinned(found)) {
        if (!CertDeleteCertificateFromStore(found)) result = ERROR_ACCESS_DENIED;
        break;
      }
    }
  } else if (!CertAddEncodedCertificateToStore(store, X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, bytes.data(), size, CERT_STORE_ADD_USE_EXISTING, nullptr)) result = ERROR_ACCESS_DENIED;
  CertCloseStore(store, 0); return result;
}
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  int count = 0; const auto args = CommandLineToArgvW(GetCommandLineW(), &count);
  if (!args) return ERROR_INVALID_PARAMETER;
  const bool trust = count == 2 && wcscmp(args[1], L"--trust") == 0;
  const bool remove = count == 2 && wcscmp(args[1], L"--revoke") == 0;
  LocalFree(args); if (!trust && !remove) return ERROR_INVALID_PARAMETER;
  try { return changeTrust(remove); } catch (...) { return ERROR_NOT_ENOUGH_MEMORY; }
}
