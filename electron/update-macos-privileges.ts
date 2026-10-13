import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import type { UpdateInstallPlan } from './update-install-types';

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
/** Fixed commands and quoted arguments; the privileged process never sources user files. */
export function macPrivilegedUpdateScript(plan: UpdateInstallPlan, uid: number): string {
  if (!Number.isInteger(uid) || uid <= 0 || !/^[a-f0-9]{64}$/i.test(plan.checksum))
    throw new Error('Invalid privileged update identity or checksum.');
  const target = quote(plan.target),
    source = quote(plan.source),
    parent = quote(dirname(plan.target));
  return `set -eu
frame_work=$(/usr/bin/mktemp -d ${parent}/.Frame-update-XXXXXXXX)
frame_mount="$frame_work/mount"
frame_backup="$frame_work/previous.app"
frame_attached=0
cleanup() {
  frame_result=$?
  if [ "$frame_result" -ne 0 ] && [ -d "$frame_backup" ]; then
    /bin/rm -rf ${target}
    /bin/mv "$frame_backup" ${target}
  fi
  if [ "$frame_attached" = 1 ]; then /usr/bin/hdiutil detach "$frame_mount" >/dev/null 2>&1 || true; fi
  /bin/rm -rf "$frame_work"
  exit "$frame_result"
}
trap cleanup EXIT
/usr/bin/ditto ${source} "$frame_work/update.dmg"
frame_checksum=$(/usr/bin/shasum -a 256 "$frame_work/update.dmg" | /usr/bin/awk '{print $1}')
[ "$frame_checksum" = ${quote(plan.checksum.toLowerCase())} ] || { echo 'Update checksum mismatch.' >&2; exit 1; }
/bin/mkdir "$frame_mount"
/usr/bin/hdiutil attach "$frame_work/update.dmg" -readonly -nobrowse -mountpoint "$frame_mount" >/dev/null
frame_attached=1
/usr/bin/codesign --verify --deep --strict "$frame_mount/Frame.app"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$frame_mount/Frame.app/Contents/Info.plist")" = io.frame.mediaeditor ]
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$frame_mount/Frame.app/Contents/Info.plist")" = ${quote(plan.version)} ]
/usr/bin/ditto "$frame_mount/Frame.app" "$frame_work/Frame.app"
/usr/bin/codesign --verify --deep --strict "$frame_work/Frame.app"
/bin/mv ${target} "$frame_backup"
/bin/mv "$frame_work/Frame.app" ${target}
/bin/launchctl asuser ${uid} /usr/bin/sudo -u ${quote('#' + uid)} /usr/bin/open -n ${target} --args --updated ${quote('--user-data-dir=' + plan.userData)}
/bin/rm -rf "$frame_backup"
`;
}
export async function applyPrivilegedMacUpdate(plan: UpdateInstallPlan) {
  const script = macPrivilegedUpdateScript(plan, process.getuid!());
  const literal = '"' + script.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
  try {
    await promisify(execFile)(
      '/usr/bin/osascript',
      ['-e', `do shell script ${literal} with administrator privileges`],
      { timeout: 300000 },
    );
  } catch (cause) {
    if (/cancel|\(-128\)/i.test((cause as Error).message))
      throw new Error('Administrator approval was cancelled. Frame was not updated.', { cause });
    throw new Error(
      'macOS could not install the update in the protected Applications folder. Frame will reopen with its previous version.',
      { cause },
    );
  }
}
