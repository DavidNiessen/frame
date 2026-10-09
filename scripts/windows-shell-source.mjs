import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export const nativeRoot = resolve('native/windows-shell');
export const sources = ['arguments.hpp', 'shell.hpp', 'launch.cpp', 'selection.cpp', 'command.cpp', 'dll.cpp', 'launcher.cpp', 'FrameShell.def', 'identity.json'];
export async function sourceFingerprint(readSource = readFile) {
  const hash = createHash('sha256');
  // Git/editor CRLF conversion does not change these text inputs to the compiler.
  // Existing Windows checkouts can retain CRLF even after -text attributes are added.
  const text = async path => (await readSource(path)).toString('utf8').replace(/\r\n/g, '\n');
  for (const name of sources) hash.update(name).update(await text(join(nativeRoot, name)));
  hash.update(await text('src/core/media-extensions.json'));
  hash.update(await readSource('build/icon.png')); // Keep binary inputs byte-exact.
  return hash.digest('hex');
}
export async function configHeader() {
  const identity = JSON.parse(await readFile(join(nativeRoot, 'identity.json'))), extensions = JSON.parse(await readFile('src/core/media-extensions.json'));
  const guid = value => {
    const [a, b, c, d, e] = value.split('-');
    return `{0x${a}, 0x${b}, 0x${c}, {${(d + e).match(/../g).map(part => `0x${part}`).join(', ')}}}`;
  };
  return `#pragma once\nnamespace frame {\ninline constexpr GUID editClsid = ${guid(identity.editClsid)};\ninline constexpr GUID convertClsid = ${guid(identity.convertClsid)};\ninline constexpr const wchar_t* extensions[] = {${extensions.map(value => `L"${value}"`).join(', ')}};\n}\n`;
}
