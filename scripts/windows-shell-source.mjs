import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export const nativeRoot = resolve('native/windows-shell');
export const sources = ['arguments.hpp', 'shell.hpp', 'launch.cpp', 'selection.cpp', 'command.cpp', 'dll.cpp', 'launcher.cpp', 'FrameShell.def', 'identity.json'];
export async function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const name of sources) hash.update(name).update(await readFile(join(nativeRoot, name)));
  hash.update(await readFile('src/core/media-extensions.json'));
  hash.update(await readFile('build/icon.png'));
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
