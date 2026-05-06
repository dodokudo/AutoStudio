'use client';

import { useEffect } from 'react';

interface RedirectClientProps {
  destinationUrl: string;
}

export default function RedirectClient({ destinationUrl }: RedirectClientProps) {
  useEffect(() => {
    window.location.replace(destinationUrl);
  }, [destinationUrl]);

  return (
    <p>
      <a href={destinationUrl}>Continue</a>
    </p>
  );
}
