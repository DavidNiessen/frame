import extensions from '../src/core/media-extensions.json';
import signature from '../native/windows-shell/package/signature.json';
import { posixShellCommand, type ShellLaunch } from './shell-command';
export const shellActions = [
  { verb: 'Frame.Edit', label: 'Edit in Frame', workflow: 'edit' },
  { verb: 'Frame.Convert', label: 'Convert in Frame', workflow: 'convert' },
] as const;
export { extensions };

export function windowsInstaller(): string {
  const install = extensions.flatMap(extension => shellActions.map(action => `  !insertmacro FrameContextVerb "${extension}" "${action.verb}" "${action.label}" "${action.workflow}"`)).join('\n');
  const uninstall = extensions.flatMap(extension => shellActions.map(action => `  !insertmacro FrameRemoveContextVerb "${extension}" "${action.verb}" "${action.workflow}"`)).join('\n');
  return `; Generated from Frame's supported media extensions. Never replace default file associations.
!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh
!ifndef BUILD_UNINSTALLER
Var FrameShellEnabled
Var FrameShellCheckbox
Var FrameShellDialog
!macro customInit
  StrCpy $FrameShellEnabled 1
  ClearErrors
  ReadRegDWORD $R0 HKCU "Software\\Frame\\ShellActions" "Enabled"
  $\{IfNot} $\{Errors}
    StrCpy $FrameShellEnabled $R0
  $\{EndIf}
  $\{GetParameters} $R0
  ClearErrors
  $\{GetOptions} $R0 "/NOFRAMECONTEXTMENU" $R1
  $\{IfNot} $\{Errors}
    StrCpy $FrameShellEnabled 0
  $\{EndIf}
  ClearErrors
  $\{GetOptions} $R0 "/FRAMECONTEXTMENU" $R1
  $\{IfNot} $\{Errors}
    StrCpy $FrameShellEnabled 1
  $\{EndIf}
!macroend
!macro customPageAfterChangeDir
  Page custom FrameShellPage FrameShellPageLeave
Function FrameShellPage
  nsDialogs::Create 1018
  Pop $FrameShellDialog
  $\{If} $FrameShellDialog == error
    Abort
  $\{EndIf}
  !insertmacro MUI_HEADER_TEXT "File-manager actions" "Choose how to open your media in Frame."
  $\{NSD_CreateLabel} 0 0 100% 30u "Open media from File Explorer"
  Pop $R0
  $\{NSD_CreateCheckbox} 0 40u 100% 28u 'Add "Edit in Frame" and "Convert in Frame" to file context menus'
  Pop $FrameShellCheckbox
  $\{NSD_SetState} $FrameShellCheckbox $FrameShellEnabled
  $\{NSD_CreateLabel} 0 82u 100% 62u "Applies to supported media and multiple selections. Windows 11 adds a Frame entry in the primary menu and keeps Show more options entries. If needed, Frame asks separately before trusting its signing certificate for this PC, then Windows asks for administrator approval. You can change actions later in Frame Settings."
  Pop $R0
  nsDialogs::Show
FunctionEnd
Function FrameShellPageLeave
  $\{NSD_GetState} $FrameShellCheckbox $FrameShellEnabled
FunctionEnd
!macroend
!endif
!macro FrameContextVerb Extension Verb Label Workflow
  WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}" "" "$\{Label}"
  WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}" "Icon" '"$INSTDIR\\$\{APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}\\command" "" '"$INSTDIR\\$\{APP_EXECUTABLE_FILENAME}" --frame-workflow=$\{Workflow} -- "%1"'
!macroend
!macro FrameRemoveContextVerb Extension Verb Workflow
  ReadRegStr $R0 HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}\\command" ""
  StrCmp $R0 '"$INSTDIR\\$\{APP_EXECUTABLE_FILENAME}" --frame-workflow=$\{Workflow} -- "%1"' 0 +2
  DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.$\{Extension}\\shell\\$\{Verb}"
!macroend
!macro FramePrimaryMenu Operation
  !if "$\{Operation}" == "Trust"
    !define FrameShellTimeout 300000
  !else
    !define FrameShellTimeout 60000
  !endif
  ; NSIS is 32-bit; use native PowerShell so Appx deployment is available on x64 Windows.
  StrCpy $R2 "$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"
  IfFileExists "$WINDIR\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe" 0 +2
  StrCpy $R2 "$WINDIR\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe"
  nsExec::ExecToStack /TIMEOUT=$\{FrameShellTimeout} '\"$R2\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"$INSTDIR\\resources\\shell-actions\\windows\\manage-menu.ps1\" -Operation $\{Operation} -Executable \"$INSTDIR\\$\{APP_EXECUTABLE_FILENAME}\"'
  !undef FrameShellTimeout
  Pop $R0
  Pop $R1
  $\{If} $R0 != 0
    DetailPrint "Windows 11 primary-menu registration needs attention. Open Frame Settings to repair or remove it. Classic entries are managed separately."
  $\{EndIf}
!macroend
!ifndef BUILD_UNINSTALLER
Function FrameTrustAndInstall
  !insertmacro FramePrimaryMenu "Trust"
  $\{If} $R0 == 0
    !insertmacro FramePrimaryMenu "Install"
  $\{EndIf}
FunctionEnd
!endif
!macro customInstall
  WriteRegDWORD HKCU "Software\\Frame\\ShellActions" "Enabled" $FrameShellEnabled
  $\{If} $FrameShellEnabled == 1
${install}
  !insertmacro FramePrimaryMenu "Install"
  $\{If} $R0 == 17
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Trust Frame's signing certificate to enable the Windows 11 menu without Developer Mode?$\\r$\\n$\\r$\\nThis trusts packages signed with the Frame certificate for all users of this PC in Trusted People. Windows will ask for administrator approval. You can remove the trust later in Frame Settings.$\\r$\\n$\\r$\\nPublisher: CN=Frame$\\r$\\nSHA-256: ${signature.certificateSha256}" /SD IDNO IDNO +2
    Call FrameTrustAndInstall
  $\{EndIf}
  $\{Else}
${uninstall}
  !insertmacro FramePrimaryMenu "Remove"
  $\{EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
!macro customUnInstall
${uninstall}
  !insertmacro FramePrimaryMenu "Remove"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
`;
}

function xml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const plist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`;
export function finderAction(action: typeof shellActions[number], launch?: ShellLaunch) {
  // Launch the executable so workflow arguments also reach an already running app.
  const command = launch ? `${posixShellCommand(launch)} --frame-workflow=${action.workflow} -- "$@" >/dev/null 2>&1 &` : `frame_app=$(/usr/bin/osascript -e 'POSIX path of (path to application id "io.frame.mediaeditor")') || exit 1\n"\${frame_app%/}/Contents/MacOS/Frame" --frame-workflow=${action.workflow} -- "$@" >/dev/null 2>&1 &`;
  const info = plist(`<key>CFBundleIdentifier</key><string>io.frame.mediaeditor.${action.workflow}.service</string><key>CFBundleName</key><string>${action.label}</string><key>NSServices</key><array><dict><key>NSMenuItem</key><dict><key>default</key><string>${action.label}</string></dict><key>NSMessage</key><string>runWorkflowAsService</string><key>NSPortName</key><string>Automator Runner</string><key>NSSendTypes</key><array><string>NSFilenamesPboardType</string></array><key>NSReturnTypes</key><array/><key>NSRequiredContext</key><dict><key>NSApplicationIdentifier</key><string>com.apple.finder</string></dict></dict></array>`);
  const document = plist(`<key>AMDocumentVersion</key><string>2</string><key>actions</key><array><dict><key>action</key><dict>
<key>AMAccepts</key><dict><key>Container</key><string>List</string><key>Optional</key><true/><key>Types</key><array><string>com.apple.cocoa.string</string></array></dict>
<key>AMActionVersion</key><string>2.0.3</string><key>AMApplication</key><array><string>Automator</string></array>
<key>AMProvides</key><dict><key>Container</key><string>List</string><key>Types</key><array><string>com.apple.cocoa.string</string></array></dict>
<key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string><key>ActionName</key><string>Run Shell Script</string>
<key>ActionParameters</key><dict><key>COMMAND_STRING</key><string>${xml(command)}</string><key>CheckedForUserDefaultShell</key><true/><key>inputMethod</key><integer>1</integer><key>shell</key><string>/bin/zsh</string></dict>
<key>BundleIdentifier</key><string>com.apple.RunShellScript</string><key>UUID</key><string>${action.workflow === 'edit' ? '10E844F8-88CE-4838-A986-5BCC0F7F4A93' : '7B556D93-9E64-46D6-903A-7BA2C8391ACD'}</string>
</dict><key>isViewVisible</key><true/></dict></array><key>connectors</key><dict/>
<key>workflowMetaData</key><dict><key>serviceApplicationBundleID</key><string>com.apple.finder</string><key>serviceApplicationPath</key><string>/System/Library/CoreServices/Finder.app</string><key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string><key>serviceOutputTypeIdentifier</key><string>com.apple.Automator.nothing</string><key>serviceProcessesInput</key><integer>0</integer><key>workflowTypeIdentifier</key><string>com.apple.Automator.servicesMenu</string></dict>`);
  return { info, document };
}

export function dolphinActions(executable: string, args: string[] = []): string {
  if ([executable, ...args].some(value => /[%\x00-\x1f]/.test(value))) throw new Error('Move Frame to a path without control characters or % before installing Dolphin actions.');
  // Desktop Entry string unescaping runs before the Exec argument unescaping.
  const quoted = [executable, ...args].map(value => '"' + value.replace(/[\\"`$]/g, character => '\\\\' + character.replace(/\\/g, '\\\\')) + '"').join(' ');
  return `[Desktop Entry]\nType=Service\nMimeType=audio/*;video/*;image/gif;\nX-KDE-ServiceTypes=KonqPopupMenu/Plugin\nActions=FrameEdit;FrameConvert;\nX-KDE-Priority=TopLevel\nX-KDE-Protocol=file\nX-KDE-MinNumberOfUrls=1\nX-KDE-MaxNumberOfUrls=2000\n\n` + shellActions.map(action => `[Desktop Action ${action.workflow === 'edit' ? 'FrameEdit' : 'FrameConvert'}]\nName=${action.label}\nIcon=video-x-generic\nExec=${quoted} --frame-workflow=${action.workflow} -- %F\n`).join('\n');
}
