'use client';

import { useEffect } from 'react';

interface RedirectClientProps {
  destinationUrl: string;
}

export default function RedirectClient({ destinationUrl }: RedirectClientProps) {
  useEffect(() => {
    // すぐにリダイレクト
    window.location.replace(destinationUrl);
  }, [destinationUrl]);

  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${destinationUrl}`} />
      </noscript>
    </>
  );
}
