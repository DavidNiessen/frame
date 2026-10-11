import type { ReactNode } from 'react';
import {
  ArrowDownUp,
  Clapperboard,
  Monitor,
  Globe,
  Scissors,
  Upload,
  Settings,
  Command,
} from 'lucide-react';
import type { Workflow } from '../core/launch';
import { DownloadApp } from './DownloadApp';
import { HeaderActions } from './HeaderActions';

interface Props {
  workflow: Workflow;
  settingsOpen: boolean;
  conversionBusy: boolean;
  importBusy: boolean;
  platform: 'desktop' | 'web';
  changeWorkflow: (workflow: Workflow) => void;
  showCommands: () => void;
  toggleSettings: () => void;
  onImport: () => void;
  children: ReactNode;
}

export function AppHeader({
  workflow,
  settingsOpen,
  conversionBusy,
  importBusy,
  platform,
  changeWorkflow,
  showCommands,
  toggleSettings,
  onImport,
  children,
}: Props) {
  return (
    <header className="app-header">
      <a
        className="brand"
        href="#"
        aria-label="Frame home"
        onClick={(event) => event.preventDefault()}
      >
        <span className="brand-mark">
          <Clapperboard size={20} strokeWidth={1.75} />
        </span>
        frame<span className="brand-dot">.</span>
      </a>
      <nav className="workflow-nav" aria-label="Workflow">
        <button
          aria-pressed={!settingsOpen && workflow === 'edit'}
          disabled={conversionBusy}
          onClick={() => changeWorkflow('edit')}
        >
          <Scissors size={14} />
          Editor
        </button>
        <button
          aria-pressed={!settingsOpen && workflow === 'convert'}
          disabled={conversionBusy}
          onClick={() => changeWorkflow('convert')}
        >
          <ArrowDownUp size={14} />
          Convert
        </button>
      </nav>
      {platform === 'web' && <DownloadApp />}
      <HeaderActions workflow={settingsOpen ? 'settings' : workflow}>
        {children}
        <div className="header-right">
          <span className="platform-badge">
            {platform === 'desktop' ? <Monitor size={13} /> : <Globe size={13} />}
            {platform === 'desktop' ? 'Desktop' : 'Web'}
            <i />
          </span>
          <button
            className="icon-button"
            aria-label="Search commands"
            title="Search commands (Ctrl / ⌘ K)"
            onClick={showCommands}
          >
            <Command size={17} />
            <span className="header-action-label">Search commands</span>
          </button>
          <button
            className="icon-button header-settings"
            aria-label="Settings"
            aria-pressed={settingsOpen}
            title="Settings"
            onClick={toggleSettings}
          >
            <Settings size={18} />
            <span className="header-action-label">Settings</span>
          </button>
          {!settingsOpen && workflow === 'edit' && (
            <button
              className="button subtle small header-import"
              onClick={onImport}
              disabled={importBusy}
            >
              <Upload size={14} />
              Import
            </button>
          )}
        </div>
      </HeaderActions>
    </header>
  );
}
