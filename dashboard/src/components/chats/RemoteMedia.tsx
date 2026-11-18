import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadMessageMedia } from '../../utils/loadMessageMedia';

interface Props {
  sessionId: string;
  messageId: string;
  /** Shown if the attachment can't be fetched. */
  fallback: ReactNode;
  /** Renders the attachment once its object URL is ready — the same markup an inline payload gets. */
  children: (src: string) => ReactNode;
  onLoaded?: (src: string) => void;
}

/**
 * A stored chat attachment, downloaded only once its bubble comes near the viewport (600px ahead),
 * so opening a chat no longer downloads every attachment in its last 100 messages.
 */
export default function RemoteMedia({ sessionId, messageId, fallback, children, onLoaded }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const onLoadedRef = useRef(onLoaded);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let cancelled = false;
    const start = () =>
      loadMessageMedia(sessionId, messageId).then(
        url => {
          if (cancelled) return;
          setSrc(url);
          onLoadedRef.current?.(url);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    if (typeof IntersectionObserver === 'undefined') {
      void start();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        observer.disconnect();
        void start();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [sessionId, messageId]);

  if (src) return <>{children(src)}</>;
  return (
    <div ref={boxRef} className="message-media-loading" aria-busy={!failed}>
      {failed ? fallback : null}
    </div>
  );
}
