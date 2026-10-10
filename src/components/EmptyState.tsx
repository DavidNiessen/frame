import { ArrowUpRight, AudioLines, Film, Link, Scissors, SlidersHorizontal, Upload, WandSparkles } from 'lucide-react';
export function EmptyState({ busy, onImport, onUrl }: { busy: boolean; onImport: () => void; onUrl: () => void }) {
  return <div className="empty-stage"><div className="empty-stage-scroll"><div className="empty-stage-content">
    <div className="empty-art" aria-hidden="true"><div className="art-grid" /><div className="art-window"><span className="art-dots"><i /><i /><i /></span><div className="art-play"><Film size={42} strokeWidth={1} /></div><div className="art-timeline"><span /><span /><span /></div></div><span className="floating-icon scissors"><Scissors size={21} /></span><span className="floating-icon audio"><AudioLines size={23} /></span></div>
    <span className="eyebrow accent-text">Your next cut starts here</span>
    <h1>Make room for<br /><span>your best moments.</span></h1>
    <p>Trim the extra. Shape the frame. Find the right format.<br className="desktop-only" /> A little less friction, a lot more possibility.</p>
    <div className="empty-actions"><button className="button primary" onClick={onImport} disabled={busy}><Upload size={17} />{busy ? 'Opening media…' : 'Import media'}<ArrowUpRight size={16} /></button><button className="button subtle" onClick={onUrl} disabled={busy}><Link size={16} />Load from URL</button></div>
    <span className="drop-hint">or drop video & audio files anywhere</span>
    <div className="feature-strip"><span><Scissors size={15} /> Trim & cut</span><span><SlidersHorizontal size={15} /> Fine-tune</span><span><WandSparkles size={15} /> Convert</span></div>
  </div></div></div>;
}
