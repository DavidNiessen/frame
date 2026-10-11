import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
function textKey(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textKey(child.props.children)
        : String(child),
    )
    .join('');
}
/** A five-second message with a visual countdown; live job progress is separate. */
export function TransientMessage({
  children,
  className = '',
  role = 'status',
  expire,
}: {
  children: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
  expire?: () => void;
}) {
  const key = textKey(children),
    [visible, setVisible] = useState(true),
    latest = useRef(expire);
  latest.current = expire;
  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      latest.current?.();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [key]);
  return visible ? (
    <div className={`transient-message ${className}`} role={role}>
      <span key={key} className="message-countdown" aria-hidden="true" />
      <div className="message-content">{children}</div>
    </div>
  ) : null;
}
