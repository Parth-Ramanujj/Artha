import { useEffect, useState } from 'react';
import { libraryApi } from '../../services/api';
import type { LibraryItem } from '../../types/library';

/** Authenticated preview of a post's image/video (the media route needs the API key, so no plain <img src>). */
export function MediaThumb({ item, controls = false }: { item: LibraryItem; controls?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (item.type === 'text') return;
    let objectUrl: string | null = null;
    let cancelled = false;
    libraryApi
      .itemMedia(item.id)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, item.type, item.updatedAt]);

  if (item.type === 'text') {
    return <div className="lib-thumb lib-thumb-text">{item.text}</div>;
  }
  if (!url) return <div className="lib-thumb" aria-label="Loading preview" />;
  return item.type === 'video' ? (
    <video className="lib-thumb" src={url} controls={controls} muted playsInline preload="metadata" />
  ) : (
    <img className="lib-thumb" src={url} alt={item.title} />
  );
}
