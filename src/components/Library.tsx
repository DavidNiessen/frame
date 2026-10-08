import { Film, Music2, Plus, Trash2, FolderOpen, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { bytes, time } from '../core/format';
export function Library({ editor, onImport }: { editor: Editor; onImport: () => void }) {
  return <aside className="library panel">
    <div className="panel-heading"><h2>Media library <span className="count">{editor.assets.length}</span></h2><button className="icon-button" aria-label="Add media" onClick={onImport} disabled={!!editor.busy}><Plus size={17} /></button></div>
    <div className="library-content">
      {!editor.assets.length ? <div className="library-empty"><FolderOpen size={28} strokeWidth={1.3} /><p>Your starting point.</p><span>Bring in a video or audio file.<br />Everything stays on your device.</span></div> :
        <ul className="asset-list">{editor.assets.map(asset => <li key={asset.id} className={asset.id === editor.selected ? 'asset selected' : 'asset'}>
          <button className="asset-select" disabled={!!editor.busy} onClick={() => editor.select(asset.id)} aria-pressed={asset.id === editor.selected}>
            <span className={`asset-icon ${asset.kind}`}>{asset.kind === 'video' ? <Film size={20} /> : <Music2 size={20} />}</span>
            <span className="asset-info"><strong title={asset.name}>{asset.name}</strong><span>{time(asset.duration)} <i>·</i> {bytes(asset.size)}</span></span>
          </button><button className="icon-button asset-remove" aria-label={`Remove ${asset.name}`} disabled={!!editor.busy} onClick={() => void editor.remove(asset)}><Trash2 size={14} /></button>
        </li>)}</ul>}
      <button className="library-import" disabled={!!editor.busy} onClick={onImport}><Plus size={16} /> Import media <span>⌘ / Ctrl O</span></button>
    </div>
    <div className="library-bottom"><span className="eyebrow">A little inspiration</span><button className="sample-card" disabled={!!editor.busy} onClick={() => void editor.importMedia(undefined, true)}>
      <span className="sample-art"><span /><Film size={24} strokeWidth={1.4} /></span><span><strong>Start with a sample</strong><small>A short studio study</small></span><ArrowUpRight size={16} />
    </button><div className="privacy-note"><ShieldCheck size={15} /><span>Local files. Private by design.</span></div></div>
  </aside>;
}
