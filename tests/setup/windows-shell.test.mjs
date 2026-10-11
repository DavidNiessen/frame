import { windowsPowerShellEnv } from '../../scripts/windows-powershell-env.mjs';
import { authenticodeContent } from '../helpers/authenticode-content.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { nativeRoot, sourceFingerprint, sources } from '../../scripts/windows-shell-source.mjs';
import { fileDigest } from '../../scripts/media-tool-files.mjs';
import { shellPackageManifest } from '../../scripts/windows-shell-package.mjs';
import { readMsixArchive } from '../../scripts/msix-archive.mjs';
import { prepareWindowsShell } from '../../scripts/prepare-windows-shell.mjs';

test('native Explorer binaries match their sources and have no non-Windows runtime DLL dependencies', async () => {
  const binaries = JSON.parse(await readFile(join(nativeRoot, 'binaries.json')));
  assert.equal(await sourceFingerprint(), binaries.sourceSha256);
  for (const [name, sha256] of Object.entries(binaries.platforms['win32-x64'])) {
    const path = join(nativeRoot, 'bin/x64', name);
    assert.equal(await fileDigest(path), sha256);
    const content = await readFile(path);
    assert.equal(content.subarray(0, 2).toString(), 'MZ');
    assert.doesNotMatch(
      content.toString('latin1'),
      /libstdc\+\+-6\.dll|libgcc_s[^\x00]*\.dll|libwinpthread-1\.dll/i,
    );
  }
});
test('accepts Windows CRLF and mixed-line-ending sources while rejecting actual source and icon changes', async () => {
  const expected = JSON.parse(await readFile(join(nativeRoot, 'binaries.json'))).sourceSha256;
  const windowsCheckout = async (path) => {
    const bytes = await readFile(path);
    return /\.(png|cer)$/.test(path)
      ? bytes
      : Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
  };
  assert.equal(await sourceFingerprint(windowsCheckout), expected);
  for (const name of [...sources, 'src/core/media-extensions.json']) {
    assert.equal(
      await sourceFingerprint((path) =>
        path.endsWith(name) ? windowsCheckout(path) : readFile(path),
      ),
      expected,
    );
  }
  const changedSource = async (path) => {
    const bytes = await windowsCheckout(path);
    return path.endsWith('command.cpp')
      ? Buffer.from(bytes.toString('utf8').replace('Edit in Frame', 'Different command'))
      : bytes;
  };
  assert.notEqual(await sourceFingerprint(changedSource), expected);
  const changedIcon = async (path) => {
    const bytes = await readFile(path);
    if (path.endsWith('.png')) bytes[bytes.length - 1] ^= 1;
    return bytes;
  };
  assert.notEqual(await sourceFingerprint(changedIcon), expected);
});
test('the Microsoft-written sparse package covers every payload block and contains no native code', async () => {
  const identity = {
    name: 'Frame.MediaEditor.Shell',
    publisher: 'CN=Frame',
    version: '1.0.0.0',
    editClsid: 'edit-clsid',
    convertClsid: 'convert-clsid',
  };
  const manifest = shellPackageManifest(identity);
  assert.match(manifest, /windows\.fileExplorerContextMenus/);
  assert.match(manifest, /AllowExternalContent>true/);
  assert.match(manifest, /Id="FrameEdit" Clsid="edit-clsid"/);
  assert.match(manifest, /Id="FrameConvert" Clsid="convert-clsid"/);
  const archive = await readFile(join(nativeRoot, 'package/FrameShell.msix'));
  const unpacked = readMsixArchive(archive),
    map = Buffer.from(unpacked['AppxBlockMap.xml']).toString('utf8');
  const covered = new Set();
  for (const [, name, size, blocksXml] of map.matchAll(
    /<File Name="([^"]+)" Size="(\d+)"[^>]*>(.*?)<\/File>/g,
  )) {
    const path = name.replace(/\\/g, '/'),
      content = unpacked[path];
    assert.ok(content, `Missing mapped payload: ${path}`);
    assert.equal(content.length, Number(size));
    const hashes = [...blocksXml.matchAll(/<Block Hash="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(hashes.length, Math.ceil(content.length / 65536));
    for (let offset = 0; offset < content.length; offset += 65536)
      assert.equal(
        hashes[offset / 65536],
        createHash('sha256')
          .update(content.subarray(offset, offset + 65536))
          .digest('base64'),
      );
    covered.add(path);
  }
  assert.deepEqual(
    [...covered].sort(),
    ['AppxManifest.xml', 'Assets/Logo150.png', 'Assets/Logo44.png', 'Assets/StoreLogo.png'].sort(),
  );
  assert.notEqual(archive.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06])), -1); // Microsoft's ZIP64 end record.
  assert.ok(unpacked['[Content_Types].xml']);
  assert.ok(!Object.keys(unpacked).some((name) => /\.(dll|exe)$/i.test(name)));
});
test('checks MSIX checksums and compression headers, including metadata rewritten by the signer', async () => {
  const archive = Buffer.from(
    zipSync(
      {
        'Assets/logo.png': Buffer.from('image bytes'),
        '[Content_Types].xml': [Buffer.from('<Types/>'), { level: 6 }],
      },
      { level: 0 },
    ),
  );
  assert.ok(readMsixArchive(archive)['[Content_Types].xml']);
  const name = Buffer.from('[Content_Types].xml');
  const local = archive.indexOf(name) - 30,
    central = archive.lastIndexOf(name) - 46;
  assert.equal(archive.readUInt16LE(local + 8), 8); // The signer deflates its replacement.
  assert.equal(archive.readUInt16LE(central + 10), 8);
  const mislabeled = Buffer.from(archive);
  mislabeled.writeUInt16LE(0, local + 8);
  mislabeled.writeUInt16LE(0, central + 10);
  assert.throws(() => readMsixArchive(mislabeled), /Invalid MSIX ZIP/);
  const corrupted = Buffer.from(archive),
    image = Buffer.from('Assets/logo.png');
  corrupted[corrupted.indexOf(image) + image.length] ^= 1;
  assert.throws(() => readMsixArchive(corrupted), /checksum.*Assets\/logo\.png/);
  // Check the actual signed artifact, beyond its PKCS#7 signature and pinned SHA-256.
  const signed = readMsixArchive(await readFile(join(nativeRoot, 'package/FrameShell.msix')));
  assert.match(Buffer.from(signed['[Content_Types].xml']).toString(), /appx\.signature/);
});
test(
  'Microsoft MSIX SDK verifies the actual signed package and rejects damaged bytes',
  { skip: !process.env.FRAME_MAKEMSIX },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-msix-sdk-'));
    try {
      const packagePath = join(nativeRoot, 'package/FrameShell.msix');
      const packer = process.env.FRAME_MAKEMSIX;
      execFileSync(packer, ['unpack', '-p', packagePath, '-d', join(directory, 'valid'), '-ac'], {
        stdio: 'pipe',
      });
      const archive = await readFile(packagePath),
        image = Buffer.from('Assets/Logo150.png');
      const start = archive.indexOf(image) + image.length;
      archive[start] ^= 1;
      const corrupt = join(directory, 'damaged.msix');
      await writeFile(corrupt, archive);
      assert.throws(() =>
        execFileSync(packer, ['unpack', '-p', corrupt, '-d', join(directory, 'invalid'), '-ac'], {
          stdio: 'pipe',
        }),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test('prepares the pinned signed package, public certificate and native helper without a compiler', async () => {
  const root = await prepareWindowsShell(),
    files = unzipSync(await readFile(join(root, 'FrameShell.msix')));
  assert.ok(files['AppxManifest.xml']);
  assert.ok(files['Assets/Logo44.png']);
  assert.ok(!files['FrameShell.dll']);
  assert.ok(!files['FrameShellLauncher.exe']);
  assert.ok((await readFile(join(root, 'manage-menu.ps1'), 'utf8')).includes('Remove-AppxPackage'));
  assert.ok(
    (await readFile(join(root, 'package-registration.ps1'), 'utf8')).includes(
      'Add-AppxPackage -Register',
    ),
  );
  assert.doesNotMatch(Buffer.from(files['AppxManifest.xml']).toString('utf8'), /OID\.2\.25/);
  const identity = JSON.parse(await readFile(join(root, 'identity.json')));
  assert.equal(identity.signedPackage, true);
  assert.ok(files['AppxSignature.p7x']);
  const certificate = new X509Certificate(await readFile(join(root, 'Frame.cer')));
  assert.equal(certificate.ca, false);
  assert.ok(certificate.keyUsage.includes('1.3.6.1.5.5.7.3.3'));
  if (!process.env.FRAME_WINDOWS_SHELL_PACKAGE) {
    assert.equal(
      await fileDigest(join(root, 'FrameShell.msix')),
      identity.certificate.packageSha256,
    );
    assert.equal(await fileDigest(join(root, 'Frame.cer')), identity.certificate.certificateSha256);
    assert.equal(
      await fileDigest(join(root, 'FrameCertificateHelper.exe')),
      identity.certificate.helperSha256,
    );
    assert.equal(certificate.fingerprint.replace(/:/g, ''), identity.certificate.thumbprint);
  }
  const helper = (await readFile(join(root, 'FrameCertificateHelper.exe'))).toString('latin1');
  assert.match(helper, /requireAdministrator/);
});
test(
  'the bundled package has a valid Authenticode signature and matches its public signer certificate',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-signed-package-'));
    try {
      const archive = unzipSync(await readFile(join(nativeRoot, 'package/FrameShell.msix')));
      const signature = Buffer.from(archive['AppxSignature.p7x']);
      assert.equal(signature.subarray(0, 4).toString(), 'PKCX');
      const certificate = new X509Certificate(
        await readFile(join(nativeRoot, 'package/Frame.cer')),
      );
      await writeFile(join(directory, 'signature.der'), signature.subarray(4));
      const content = authenticodeContent(signature.subarray(4));
      await writeFile(join(directory, 'signed-content.bin'), content);
      await writeFile(join(directory, 'certificate.pem'), certificate.toString());
      const args = [
        'smime',
        '-verify',
        '-binary',
        '-content',
        join(directory, 'signed-content.bin'),
        '-inform',
        'DER',
        '-in',
        join(directory, 'signature.der'),
        '-CAfile',
        join(directory, 'certificate.pem'),
        '-purpose',
        'any',
        '-out',
        join(directory, 'content.der'),
      ];
      execFileSync('openssl', args, { stdio: 'pipe' });
      assert.ok((await readFile(join(directory, 'content.der'))).length > 100);
      assert.ok(signature.includes(certificate.raw));
      const damaged = Buffer.from(content);
      damaged[0] ^= 1;
      await writeFile(join(directory, 'signed-content.bin'), damaged);
      assert.throws(() => execFileSync('openssl', args, { stdio: 'pipe' }));
      await writeFile(join(directory, 'signed-content.bin'), content);
      signature[signature.length - 1] ^= 1;
      await writeFile(join(directory, 'signature.der'), signature.subarray(4));
      assert.throws(() => execFileSync('openssl', args, { stdio: 'pipe' }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test(
  'Windows can read the signed package manifest and identity through its native Appx reader',
  { skip: process.platform !== 'win32' },
  async () => {
    const powershell = join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    );
    const output = execFileSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'scripts/validate-windows-shell.ps1',
      ],
      { encoding: 'utf8', env: windowsPowerShellEnv() },
    );
    assert.match(output, /Windows package reader accepted: Frame\.MediaEditor\.Shell_/);
    const directory = await mkdtemp(join(tmpdir(), 'frame-invalid-msix-'));
    try {
      const path = join(directory, 'invalid.msix');
      await writeFile(path, 'Invalid ZIP package');
      assert.throws(
        () =>
          execFileSync(
            powershell,
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              'scripts/validate-windows-shell.ps1',
              '-Package',
              path,
            ],
            { stdio: 'pipe', env: windowsPowerShellEnv() },
          ),
        (error) => {
          assert.match(error.stdout.toString(), /Windows CreatePackageReader.*HRESULT 0x/);
          return true;
        },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test('uses signed deployment or existing Developer Mode and repairs persistent registration files', async (t) => {
  const powershell =
    process.env.FRAME_TEST_POWERSHELL ||
    (process.platform === 'win32'
      ? join(
          process.env.SystemRoot || 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        )
      : 'pwsh');
  try {
    execFileSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      env: process.platform === 'win32' ? windowsPowerShellEnv() : process.env,
    });
  } catch (error) {
    if (process.platform !== 'win32' && error.code === 'ENOENT') {
      t.skip('PowerShell is not installed on this host.');
      return;
    }
    throw error;
  }
  const directory = await mkdtemp(join(tmpdir(), 'frame-package-policy-'));
  try {
    const output = execFileSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'tests/helpers/windows-package-registration.ps1',
        '-Helper',
        join(nativeRoot, 'package-registration.ps1'),
        '-Directory',
        directory,
      ],
      { encoding: 'utf8', env: windowsPowerShellEnv() },
    );
    assert.match(output, /policy and lifecycle checks passed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test(
  'quotes Unicode and special filenames and batches long selections using the native launch code',
  { skip: process.platform === 'win32' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-shell-arguments-'));
    try {
      const source = `#include "${join(nativeRoot, 'arguments.hpp')}"\n#include <cassert>\nint main() {
      assert(frame::quote(L"C:\\\\songs\\\\") == L"\\\"C:\\\\songs\\\\\\\\\\\"");
      assert(frame::quote(L"a\\\"b") == L"\\\"a\\\\\\\"b\\\"");
      assert(frame::commands(L"Frame.exe", {L"Bj\\u00f6rk & mix.wav", L"100% song.mp3"}, false)[0] == L"Frame.exe --frame-workflow=convert -- \\\"Bj\\u00f6rk & mix.wav\\\" \\\"100% song.mp3\\\"");
      std::vector<std::wstring> paths(2000, std::wstring(100, L'x') + L".wav");
      const auto batches = frame::commands(L"Frame.exe", paths, true); assert(batches.size() > 1);
      size_t total = 0; for (const auto& command : batches) { assert(command.size() <= 32760); for (const auto& path : paths) { (void)path; } total += command.size(); }
      assert(total > 200000);
      bool rejected = false; try { frame::commands(L"Frame.exe", {std::wstring(33000, L'x')}, true); } catch (const std::length_error&) { rejected = true; } assert(rejected);
    }`;
      await writeFile(join(directory, 'test.cpp'), source);
      execFileSync('g++', [
        '-std=c++17',
        join(directory, 'test.cpp'),
        '-o',
        join(directory, 'test'),
      ]);
      execFileSync(join(directory, 'test'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
