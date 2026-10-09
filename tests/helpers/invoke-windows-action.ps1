param(
  [Parameter(Mandatory=$true)][string]$Directory,
  [Parameter(Mandatory=$true)][ValidateSet('Edit', 'Convert')][string]$Workflow
)
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace($Directory)
if ($null -eq $folder) { throw 'Could not open the test media directory in the Windows shell.' }
$selection = $folder.Items()
$selection.Filter(64, 'Selection *.*')
if ($selection.Count -ne 2) { throw 'Expected exactly two selected test files.' }
$selection.InvokeVerbEx("Frame.$Workflow")
