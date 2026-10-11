import { X } from 'lucide-react';
import { useLoadingTask } from '../hooks/useLoadingActivity';
/** Shared by the main footer and the expanded mini converter's bottom island. */
export function ActivityStatus() {
  const task = useLoadingTask();
  const percent =
    task?.ratio !== undefined && Number.isFinite(task.ratio)
      ? Math.round(Math.max(0, Math.min(1, task.ratio)) * 100)
      : null;
  return (
    <div className="footer-task">
      <span className="footer-activity" role="status" title={task?.message || task?.label}>
        <span className="status-dot" />
        <span className="footer-task-label">
          {task?.label || 'All processing happens on your device'}
        </span>
        {task?.message && task.message !== task.label && (
          <span className="footer-task-detail">{task.message}</span>
        )}
        {percent !== null && <span className="footer-task-percent">{percent}%</span>}
      </span>
      {task?.cancel && (
        <button
          className="footer-cancel"
          aria-label={task.cancelLabel || 'Cancel'}
          title={task.cancelLabel || 'Cancel'}
          onClick={task.cancel}
        >
          <X size={14} />
          <span className="footer-cancel-label">{task.cancelLabel || 'Cancel'}</span>
        </button>
      )}
    </div>
  );
}
