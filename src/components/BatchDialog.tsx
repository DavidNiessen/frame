import { useEffect, useRef, useState } from 'react';
import { Layers, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { Batch } from '../hooks/useBatch';
import type { BatchMode } from '../core/batch';
export function BatchDialog({
  open,
  close,
  editor,
  batch,
}: {
  open: boolean;
  close: () => void;
  editor: Editor;
  batch: Batch;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState<BatchMode>('individual');
  useEffect(() => {
    if (open) {
      setIds(editor.assets.map((a) => a.id));
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  const running = editor.busy === 'batch';
  return (
    <dialog
      ref={dialog}
      className="shortcuts-dialog project-dialog"
      aria-labelledby="batch-title"
      onCancel={(event) => {
        if (running) event.preventDefault();
        else close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="batch-title">
          <Layers size={18} />
          Batch export
        </h2>
        <button
          className="icon-button"
          aria-label="Close batch export"
          disabled={running}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <p className="project-intro">
        {editor.platform === 'desktop'
          ? 'Choose a destination folder once. Existing files are preserved with numbered export names.'
          : 'Files process one at a time. Save each completed download before clearing the queue.'}
      </p>
      <fieldset disabled={!!editor.busy}>
        <label className="stacked-label">
          Batch settings
          <select
            aria-label="Batch settings"
            value={mode}
            onChange={(event) => setMode(event.target.value as BatchMode)}
          >
            <option value="individual">Use each file’s edits</option>
            <option value="output">Apply current output settings</option>
            <option value="edits">Apply all current edits</option>
          </select>
        </label>
        <div className="batch-files">
          {editor.assets.map((asset) => (
            <label key={asset.id}>
              <input
                type="checkbox"
                aria-label={`Include ${asset.name} in batch`}
                checked={ids.includes(asset.id)}
                onChange={(event) =>
                  setIds((current) =>
                    event.target.checked
                      ? [...current, asset.id]
                      : current.filter((id) => id !== asset.id),
                  )
                }
              />
              <span>{asset.name}</span>
            </label>
          ))}
        </div>
        <p className="field-note">Incompatible edits are reported per file; other jobs continue.</p>
      </fieldset>
      <div className="batch-jobs" aria-live="polite">
        {batch.jobs.map((job) => (
          <div key={job.id}>
            <strong>{job.asset.name}</strong>
            <span>{job.status}</span>
            {job.error && <p>{job.error}</p>}
            {job.result?.url && (
              <a className="button subtle small" href={job.result.url} download={job.result.name}>
                Save {job.result.name}
              </a>
            )}
            {job.result?.path && <p className="saved-path">{job.result.path}</p>}
          </div>
        ))}
      </div>
      <div className="project-actions">
        {running ? (
          <button className="button subtle small" onClick={batch.cancel}>
            Cancel batch
          </button>
        ) : (
          <>
            <button
              className="button subtle small"
              onClick={batch.clear}
              disabled={!batch.jobs.length}
            >
              Clear queue
            </button>
            <button
              className="button primary small"
              disabled={!!editor.busy || !ids.length}
              onClick={() => void batch.start(ids, mode)}
            >
              Start batch export
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
