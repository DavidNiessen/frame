import { Layers } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
export function EffectScope({ editor }: { editor: Editor; seek: (time: number) => void }) {
  if (!editor.edit) return null;
  return (
    <div className="effect-scope">
      <span>
        <Layers size={14} />
        Timeline track
      </span>
      <small>Effects span splits. Drag their bars to set timing.</small>
    </div>
  );
}
