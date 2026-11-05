'use client';

import { useEffect } from 'react';
import { LoadError } from '@/components/load-error';

/** Something on this page failed to render or load: keep the menu, offer to try again. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="pt-4">
      <LoadError onRetry={reset} />
    </div>
  );
}
