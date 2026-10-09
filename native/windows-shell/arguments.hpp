#pragma once
#include <string>
#include <vector>
#include <stdexcept>

namespace frame {
// CommandLineToArgvW/CreateProcess quoting, including quotes and trailing backslashes.
inline std::wstring quote(const std::wstring& value) {
  std::wstring result = L"\"";
  size_t slashes = 0;
  for (wchar_t character : value) {
    if (character == L'\\') { ++slashes; continue; }
    result.append(character == L'"' ? slashes * 2 + 1 : slashes, L'\\');
    slashes = 0; result += character;
  }
  result.append(slashes * 2, L'\\'); return result + L'"';
}
inline std::vector<std::wstring> commands(const std::wstring& prefix, const std::vector<std::wstring>& paths, bool edit) {
  const auto start = prefix + (edit ? L" --frame-workflow=edit --" : L" --frame-workflow=convert --");
  constexpr size_t limit = 32760;
  if (start.size() > limit) throw std::length_error("Launch command is too long");
  std::vector<std::wstring> result;
  auto command = start;
  for (const auto& path : paths) {
    const auto argument = L" " + quote(path);
    if (start.size() + argument.size() > limit) throw std::length_error("Selected path is too long");
    if (command.size() + argument.size() > limit) { result.push_back(command); command = start; }
    command += argument;
  }
  result.push_back(command); return result;
}
}
