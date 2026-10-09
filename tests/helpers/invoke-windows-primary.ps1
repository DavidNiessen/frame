param(
  [Parameter(Mandatory=$true)][string]$Directory,
  [Parameter(Mandatory=$true)][ValidateSet('Edit', 'Convert')][string]$Workflow
)
$ErrorActionPreference = 'Stop'
$identity = Get-Content (Join-Path $PSScriptRoot '../../native/windows-shell/identity.json') -Raw | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("A08CE4D0-FA25-44AB-B57C-C7B1C323E0B9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface FrameExplorerCommand {
  [PreserveSig] int GetTitle(IntPtr items, out IntPtr title);
  [PreserveSig] int GetIcon(IntPtr items, out IntPtr icon);
  [PreserveSig] int GetToolTip(IntPtr items, out IntPtr tip);
  [PreserveSig] int GetCanonicalName(out Guid id);
  [PreserveSig] int GetState(IntPtr items, [MarshalAs(UnmanagedType.Bool)] bool slow, out uint state);
  [PreserveSig] int Invoke(IntPtr items, IntPtr bindContext);
  [PreserveSig] int GetFlags(out uint flags);
  [PreserveSig] int EnumSubCommands(out IntPtr commands);
}
public static class FramePrimaryTest {
  [DllImport("ole32.dll")] static extern int CoCreateInstance(ref Guid id, IntPtr outer, uint context, ref Guid iid, out IntPtr result);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SHParseDisplayName(string path, IntPtr bind, out IntPtr pidl, uint requested, out uint attributes);
  [DllImport("shell32.dll")] static extern int SHCreateShellItemArrayFromIDLists(uint count, [In] IntPtr[] pidls, out IntPtr items);
  public static FrameExplorerCommand Create(string clsid) {
    Guid id = new Guid(clsid), iid = typeof(FrameExplorerCommand).GUID; IntPtr result;
    Marshal.ThrowExceptionForHR(CoCreateInstance(ref id, IntPtr.Zero, 5, ref iid, out result));
    try { return (FrameExplorerCommand)Marshal.GetObjectForIUnknown(result); }
    finally { Marshal.Release(result); }
  }
  public static IntPtr Selection(string[] paths) {
    IntPtr[] pidls = new IntPtr[paths.Length];
    try {
      for (int i = 0; i < paths.Length; i++) { uint attributes; Marshal.ThrowExceptionForHR(SHParseDisplayName(paths[i], IntPtr.Zero, out pidls[i], 0, out attributes)); }
      IntPtr items; Marshal.ThrowExceptionForHR(SHCreateShellItemArrayFromIDLists((uint)paths.Length, pidls, out items)); return items;
    } finally { foreach (IntPtr pidl in pidls) if (pidl != IntPtr.Zero) Marshal.FreeCoTaskMem(pidl); }
  }
  public static uint State(FrameExplorerCommand command, string[] paths) {
    IntPtr items = Selection(paths);
    try { uint state; Marshal.ThrowExceptionForHR(command.GetState(items, true, out state)); return state; }
    finally { Marshal.Release(items); }
  }
  public static void Invoke(FrameExplorerCommand command, string[] paths, string title) {
    IntPtr items = Selection(paths), text = IntPtr.Zero;
    try {
      Marshal.ThrowExceptionForHR(command.GetTitle(items, out text));
      if (Marshal.PtrToStringUni(text) != title) throw new Exception("Incorrect native command title.");
      uint state; Marshal.ThrowExceptionForHR(command.GetState(items, true, out state));
      if (state != 0) throw new Exception("Native command is not enabled for mixed media.");
      Marshal.ThrowExceptionForHR(command.Invoke(items, IntPtr.Zero));
    } finally { if (text != IntPtr.Zero) Marshal.FreeCoTaskMem(text); Marshal.Release(items); }
  }
}
'@
$paths = @(Get-ChildItem -LiteralPath $Directory -Filter 'Selection *.*' -File | ForEach-Object { $_.FullName })
if ($paths.Count -ne 2) { throw 'Expected exactly two selected test files.' }
$clsid = if ($Workflow -eq 'Edit') { $identity.editClsid } else { $identity.convertClsid }
$command = [FramePrimaryTest]::Create($clsid)
try {
  if ([FramePrimaryTest]::State($command, @($Directory)) -ne 2) { throw 'Native actions must be hidden for folders.' }
  $unsupported = Join-Path $Directory 'booklet.txt'
  Set-Content -LiteralPath $unsupported -Value 'Unsupported media'
  if ([FramePrimaryTest]::State($command, @($paths[0], $unsupported)) -ne 2) { throw 'Native actions must be hidden for unsupported mixed selections.' }
  [FramePrimaryTest]::Invoke($command, $paths, "$Workflow in Frame")
} finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($command) | Out-Null }
