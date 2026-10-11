import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/** Downloader subprocesses include a bootloader, JavaScript runtime and FFmpeg. */
export async function stopProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' },
      );
      const timeout = setTimeout(() => {
        killer.kill();
        child.kill();
        resolve();
      }, 3000);
      const done = () => {
        clearTimeout(timeout);
        child.kill();
        resolve();
      };
      killer.once('error', done);
      killer.once('close', done);
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill();
    }
    // Kill the group even if its parent exits before a subprocess does.
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* Process group has exited. */
    }
  }
}
