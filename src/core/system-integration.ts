export interface ShellIntegrationStatus {
  platform: string;
  available: boolean;
  state: 'installed' | 'partial' | 'not-installed';
  detail: string;
}
