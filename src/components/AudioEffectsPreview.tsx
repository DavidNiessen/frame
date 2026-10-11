import { TransientMessage } from './TransientMessage';
import type { Editor } from '../hooks/useEditor';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { pauseOtherMedia } from '../hooks/usePreviewEffects';
import { LoudnessControls } from './LoudnessControls';
/** One preview and loudness report cover all expanded audio adjustments on this target. */
export function AudioEffectsPreview({ editor }: { editor: Editor }) {
  const preview = useAudioPreview(editor);
  return (
    <div className="audio-effects-review">
      <button
        className="button subtle small"
        disabled={preview.loading}
        onClick={() => void preview.generate()}
      >
        {preview.loading ? 'Preparing preview…' : 'Preview audio effects'}
      </button>
      {preview.url && (
        <audio
          className="effects-audio"
          aria-label="Processed audio preview"
          controls
          src={preview.url}
          onPlay={(event) => pauseOtherMedia(event.currentTarget)}
        />
      )}
      <LoudnessControls editor={editor} />
      {preview.error && (
        <TransientMessage className="field-note" role="alert">
          {preview.error}
        </TransientMessage>
      )}
      <p className="field-note">
        Preview processes a retained section up to 10 seconds, without fades. Export processes the
        full edit. Volume gain applies after normalization; boosting it can clip.
      </p>
    </div>
  );
}
