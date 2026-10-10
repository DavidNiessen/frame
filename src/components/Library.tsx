import { Film, Music2, Plus, Trash2, FolderOpen, Link, ListPlus, AudioLines } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { mediaDragType } from '../core/media-insertion';
import { bytes, time } from '../core/format';
export function Library({ editor, onImport, onUrl, onClear, clearDisabled, hasSavedWorkspace, onInsert }: { editor: Editor; onImport: () => void; onUrl: () => void; onClear: () => void; clearDisabled: boolean; hasSavedWorkspace: boolean; onInsert: (id: string) => void }) {
  return <aside id="media-library" className="library panel">
    <div className="panel-heading"><h2>Media library <span className="count">{editor.assets.length}</span></h2><div className="library-heading-actions"><button className="icon-button" aria-label="Clear media library" title="Clear library and saved workspace" disabled={clearDisabled || !!editor.busy || (!editor.assets.length && !hasSavedWorkspace)} onClick={onClear}><Trash2 size={15} /></button><button className="icon-button" aria-label="Add media" onClick={onImport} disabled={!!editor.busy}><Plus size={17} /></button></div></div>
    <div className="library-content">
      {!editor.assets.length ? <div className="library-empty"><FolderOpen size={28} strokeWidth={1.3} /><p>Your starting point.</p><span>Bring in a video or audio file.<br />Everything stays on your device.</span></div> :
        <ul className="asset-list">{editor.assets.map(asset => <li key={asset.id} className={asset.id === editor.selected ? 'asset selected' : 'asset'}>
          <button className="asset-select" draggable={!editor.busy} onDragStart={event => { event.dataTransfer.setData(mediaDragType, asset.id); event.dataTransfer.effectAllowed = 'copy'; }} disabled={!!editor.busy} onClick={() => editor.select(asset.id)} aria-pressed={asset.id === editor.selected}>
            <span className={`asset-icon ${asset.kind}`}>{asset.kind === 'video' ? <Film size={20} /> : <Music2 size={20} />}</span>
            <span className="asset-info"><strong title={asset.name}>{asset.name}</strong><span>{time(asset.duration)} <i>·</i> {bytes(asset.size)}</span></span>
          </button>{editor.asset && asset.id !== editor.selected && <button className="icon-button asset-insert" aria-label={`${asset.kind === 'video' ? 'Insert' : 'Layer'} ${asset.name} ${asset.kind === 'video' ? 'into' : 'over'} timeline`} title={asset.kind === 'video' ? editor.asset.kind === 'video' ? 'Insert at the end of the current sequence' : 'Select a video sequence first' : 'Add an audio layer at the playhead'} disabled={!!editor.busy || asset.kind === 'video' && editor.asset.kind !== 'video'} onClick={() => onInsert(asset.id)}>{asset.kind === 'video' ? <ListPlus size={14} /> : <AudioLines size={14} />}</button>}<button className="icon-button asset-remove" aria-label={`Remove ${asset.name}`} disabled={!!editor.busy} onClick={() => void editor.remove(asset)}><Trash2 size={14} /></button>
        </li>)}</ul>}
    </div>
    <div className="library-import-actions"><button className="library-import" disabled={!!editor.busy} onClick={onImport}><Plus size={16} /> Import media <span>⌘ / Ctrl O</span></button><button className="library-url" disabled={!!editor.busy} onClick={onUrl}><Link size={14} />Load from URL</button></div>

  </aside>;
}
