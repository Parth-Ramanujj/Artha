import { useState } from 'react';

/** Busy / error / notice state for a tab's async actions. */
export function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const messages = (
    <>
      {error && (
        <p className="sa-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sa-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );

  return { busy, run, messages };
}
