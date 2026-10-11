export interface ShellLaunch {
  executable: string;
  args?: string[];
}

// Explorer passes this command to CreateProcess, whose quoting rules also apply to trailing backslashes.
export function windowsLaunchPrefix(launch: ShellLaunch) {
  const quote = (value: string) =>
    '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
  return [launch.executable, ...(launch.args || [])].map(quote).join(' ');
}
export function windowsShellCommand(launch: ShellLaunch, workflow: string) {
  return windowsLaunchPrefix(launch) + ` --frame-workflow=${workflow} -- "%1"`;
}
export function posixShellCommand(launch: ShellLaunch) {
  return [launch.executable, ...(launch.args || [])]
    .map((value) => "'" + value.replace(/'/g, "'\\''") + "'")
    .join(' ');
}
