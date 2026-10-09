import { ArrowDownUp, FileAudio, Film, FolderOpen, LoaderCircle, Plus, ShieldCheck } from 'lucide-react';
import type { Editor } from '../../hooks/useEditor';
import type { Conversion } from '../../hooks/useConversion';
import { ConversionQueue } from './ConversionQueue';
import { ConversionSettings } from './ConversionSettings';
import { ConversionResults } from './ConversionResults';

export function ConversionWorkspace({ editor, conversion: c, onFiles, onFolder, folderSupported }: { editor: Editor; conversion: Conversion; onFiles: () => void; onFolder: () => void; folderSupported: boolean }) {
  const report = editor.importReport;
  return <main className="conversion-workspace">
    <div className="conversion-intro"><div><span className="eyebrow accent-text">A simpler way to change formats</span><h1>Convert your library<span>.</span></h1><p>One file or a whole folder. One format. Everything stays organized.</p></div>{editor.assets.length > 0 && <div className="conversion-add-actions"><button className="button subtle" disabled={c.busy} onClick={onFiles}><Plus size={16} />Add files</button><button className="button subtle" disabled={c.busy || !folderSupported} onClick={onFolder}><FolderOpen size={16} />Add folder</button></div>}</div>
    <div className="conversion-layout"><div className="conversion-main">
      {editor.busy === 'import' && <div className="conversion-import-progress" role="status"><LoaderCircle className="spinner" size={18} /><span>{editor.progress?.message || 'Reading your media…'}<small>Reading files locally. Nothing is uploaded.</small></span></div>}
      {report && (report.issues.length > 0 || report.skipped > 0) && <details className="conversion-import-report"><summary>{report.issues.length ? `${report.issues.length} ${report.issues.length === 1 ? 'file could' : 'files could'} not be read` : 'Non-media files skipped'}{report.skipped ? ` · ${report.skipped} other ${report.skipped === 1 ? 'file' : 'files'} skipped` : ''}</summary><p>{report.assets.length ? 'Readable media was added to your queue.' : 'Choose another folder or add supported media files.'}</p>{report.issues.slice(0, 50).map((issue, index) => <p key={index}><strong>{issue.name}</strong> — {issue.message}</p>)}{report.issues.length > 50 && <p>And {report.issues.length - 50} more unreadable files.</p>}</details>}
      <ConversionResults editor={editor} conversion={c} />
      {editor.assets.length ? <ConversionQueue editor={editor} conversion={c} /> : <section className="conversion-empty panel"><div className="conversion-empty-art" aria-hidden="true"><span className="conversion-art-file"><FileAudio size={29} /><i /><i /></span><span className="conversion-art-folder"><FolderOpen size={53} strokeWidth={1.3} /></span><span className="conversion-art-video"><Film size={24} /><ArrowDownUp size={15} /></span></div><span className="eyebrow">Your collection, a new format</span><h2>Bring your media together.</h2><p>Add a folder of songs, a set of videos, or both.<br />Choose the output once. Convert them all.</p><div className="conversion-add-actions"><button className="button primary" disabled={c.busy || !folderSupported} onClick={onFolder}><FolderOpen size={17} />Add folder</button><button className="button subtle" disabled={c.busy} onClick={onFiles}><Plus size={17} />Add files</button></div><span className="conversion-drop-hint">{folderSupported ? 'or drop files and folders here' : 'or drop media files here. Folder selection is unavailable in this browser.'}</span><div className="conversion-supported">MP3 · WAV · FLAC · MP4 · GIF · and more</div></section>}
      <p className="conversion-privacy"><ShieldCheck size={15} />{editor.platform === 'desktop' ? 'Portable media tools included. No extra installations or uploads.' : 'Private, local conversion. For large libraries, use the desktop app.'}</p>
    </div><ConversionSettings editor={editor} conversion={c} /></div>
  </main>;
}
