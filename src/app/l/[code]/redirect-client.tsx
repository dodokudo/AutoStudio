'use client';

import { useEffect } from 'react';

interface RedirectClientProps {
  destinationUrl: string;
}

export default function RedirectClient({ destinationUrl }: RedirectClientProps) {
  useEffect(() => {
    // すぐにリダイレクト
    window.location.href = destinationUrl;
  }, [destinationUrl]);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <p>リダイレクト中...</p>
    </div>
  );
}
