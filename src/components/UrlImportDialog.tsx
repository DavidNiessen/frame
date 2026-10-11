import { TransientMessage } from './TransientMessage';
import { useEffect, useRef, useState } from 'react';
import { Download, Link, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { mediaUrl } from '../core/remote-media';
import { youtubeVideo, type UrlImportOptions } from '../core/youtube';

export function UrlImportDialog({
  open,
  close,
  editor,
}: {
  open: boolean;
  close: () => void;
  editor: Editor;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [running, setRunning] = useState(false);
  const [youtube, setYoutube] = useState<Required<UrlImportOptions>['youtube']>({
    mode: 'video',
    quality: '1080',
  });
  let isYoutube = false;
  try {
    isYoutube = !!youtubeVideo(url);
  } catch {
    /* Validate unfinished links on submit. */
  }
  const submitting = useRef(false);
  useEffect(() => {
    if (open) {
      setUrl('');
      setError('');
      dialog.current?.showModal();
      input.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || editor.busy) return;
    setError('');
    let address: string;
    try {
      address = mediaUrl(url).href;
      if (youtubeVideo(address) && editor.platform === 'web')
        throw new Error(
          'YouTube imports are available in the Frame desktop app. On web, paste a direct audio or video file link.',
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      input.current?.focus();
      return;
    }
    submitting.current = true;
    setRunning(true);
    try {
      if (await editor.importUrl(address, isYoutube ? { youtube } : undefined)) close();
      else setError('Wait for processing to finish, then try again.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this media URL.');
    } finally {
      submitting.current = false;
      setRunning(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog url-import-dialog"
      aria-labelledby="url-import-title"
      onCancel={(event) => {
        if (running) {
          event.preventDefault();
          editor.cancel();
        } else close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="url-import-title">
          <Link size={18} />
          Load from URL
        </h2>
        <button
          className="icon-button"
          aria-label="Close URL import"
          disabled={running}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <p className="project-intro">
        {editor.platform === 'desktop'
          ? 'Paste a direct media file link or a YouTube video link.'
          : 'Paste a direct link to a video or audio file.'}{' '}
        Frame downloads it, then opens it in your current workflow.
      </p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label className="stacked-label" htmlFor="media-url">
          Media URL
        </label>
        <input
          ref={input}
          id="media-url"
          className="media-url-input"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError('');
          }}
          placeholder="https://example.com/song.mp3"
          maxLength={8192}
          autoComplete="off"
          spellCheck={false}
          disabled={running}
          aria-describedby="url-import-note"
          aria-invalid={!!error}
        />
        {isYoutube && editor.platform === 'desktop' && (
          <div className="youtube-import-options">
            <label className="stacked-label">
              Import as
              <select
                aria-label="YouTube import type"
                value={youtube.mode}
                disabled={running}
                onChange={(event) =>
                  setYoutube((value) => ({
                    ...value,
                    mode: event.target.value as 'video' | 'audio',
                  }))
                }
              >
                <option value="video">Video with audio</option>
                <option value="audio">Audio only</option>
              </select>
            </label>
            {youtube.mode === 'video' && (
              <label className="stacked-label">
                Video quality
                <select
                  aria-label="YouTube video quality"
                  value={youtube.quality}
                  disabled={running}
                  onChange={(event) =>
                    setYoutube((value) => ({
                      ...value,
                      quality: event.target.value as typeof value.quality,
                    }))
                  }
                >
                  <option value="1080">Up to 1080p</option>
                  <option value="720">Up to 720p</option>
                  <option value="480">Up to 480p</option>
                  <option value="best">Best available</option>
                </select>
              </label>
            )}
            <p className="field-note">
              Downloads the original streams without re-encoding. Choose your output format after
              import. Individual, publicly accessible videos only; live streams are not supported.
            </p>
          </div>
        )}
        <p id="url-import-note" className="field-note">
          {editor.platform === 'desktop'
            ? 'Direct files and individual YouTube videos are supported. Other page links and playlist-only links are not supported.'
            : 'Direct files only; page links and streaming playlists are not supported. YouTube imports require the desktop app. The host must allow cross-origin downloads (CORS).'}{' '}
          Export a copy to keep downloaded media after this session.
        </p>
        {error && (
          <TransientMessage className="project-error" role="alert">
            {error}
          </TransientMessage>
        )}
        <div className="project-actions">
          {running ? (
            <button type="button" className="button subtle" onClick={editor.cancel}>
              Cancel download
            </button>
          ) : (
            <>
              <button type="button" className="button subtle" onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!!editor.busy || !url.trim()}
              >
                <Download size={15} />
                Load media
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
