'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/home');
      } else {
        setError('パスワードが違います');
      }
    } catch {
      setError('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background gradient-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 p-8 glass-card"
      >
        <h1 className="text-2xl font-bold text-text-primary text-center">
          AutoStudio
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          className="w-full px-4 py-3 rounded-[var(--radius-md)] bg-surface text-text-primary border border-border focus:outline-none focus:border-accent transition-colors"
          autoFocus
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-[var(--radius-md)] bg-text-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}
