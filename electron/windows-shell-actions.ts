import { windowsPowerShellEnv } from '../scripts/windows-powershell-env.mjs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { extensions, shellActions } from './shell-action-definitions';
import { windowsShellCommand, type ShellLaunch } from './shell-command';

// Use .NET registry APIs instead of interpolating filenames into shell commands.
// All registrations are per-user; default file associations are never modified.
export async function windowsShellActions(
  launch: ShellLaunch,
  operation: 'status' | 'install' | 'remove',
) {
  const entries = extensions.flatMap((extension) =>
    shellActions.map((action) => ({
      key: `Software\\Classes\\SystemFileAssociations\\.${extension}\\shell\\${action.verb}`,
      label: action.label,
      icon: `"${launch.executable}",0`,
      command: windowsShellCommand(launch, action.workflow),
    })),
  );
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$registry = [Microsoft.Win32.Registry]::CurrentUser
$owned = 0; $complete = 0
foreach ($entry in $data.entries) {
  $command = $registry.OpenSubKey($entry.key + '\\command')
  $matches = $null -ne $command -and $command.GetValue('') -eq $entry.command
  if ($null -ne $command) { $command.Dispose() }
  if ($data.operation -eq 'install') {
    $key = $registry.CreateSubKey($entry.key)
    try { $key.SetValue('', $entry.label); $key.SetValue('Icon', $entry.icon); $key.SetValue('MultiSelectModel', 'Player') } finally { $key.Dispose() }
    $key = $registry.CreateSubKey($entry.key + '\\command')
    try { $key.SetValue('', $entry.command) } finally { $key.Dispose() }
    $matches = $true
  } elseif ($data.operation -eq 'remove' -and $matches) {
    $registry.DeleteSubKeyTree($entry.key, $false)
    $matches = $false
  }
  if ($matches) {
    $owned++
    $key = $registry.OpenSubKey($entry.key)
    try { if ($key.GetValue('') -eq $entry.label -and $key.GetValue('Icon') -eq $entry.icon -and $key.GetValue('MultiSelectModel') -eq 'Player') { $complete++ } } finally { $key.Dispose() }
  }
}
if ($data.operation -ne 'status') {
  $key = $registry.CreateSubKey('Software\\Frame\\ShellActions')
  try { $key.SetValue('Enabled', [int]($data.operation -eq 'install'), [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $key.Dispose() }
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class FrameShell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b); }'
  [FrameShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}
@{ owned = $owned; complete = $complete; total = $data.entries.Count } | ConvertTo-Json -Compress
`;
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  // Send paths through stdin to avoid Windows' command-line length limit for long install paths.
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, env: windowsPowerShellEnv(), timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, output) => (error ? reject(error) : resolve(output)),
    );
    child.stdin!.on('error', reject);
    child.stdin!.end(JSON.stringify({ entries, operation }), 'utf8');
  });
  const result = JSON.parse(stdout.trim()) as { owned: number; complete: number; total: number };
  return result.complete === result.total
    ? 'installed'
    : result.owned > 0
      ? 'partial'
      : 'not-installed';
}
