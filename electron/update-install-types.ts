export interface UpdateInstallPlan {
  platform: 'darwin' | 'linux' | 'win32';
  arch: string;
  parent: number;
  source: string;
  checksum: string;
  target: string;
  version: string;
  directory: string;
  userData: string;
}
