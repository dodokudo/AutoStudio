import type { FC } from 'react';

type LoadingScreenProps = {
  message?: string;
};

const LoadingScreen: FC<LoadingScreenProps> = ({ message = 'データ読み込み中' }) => (
  <div className="flex min-h-[min(60vh,640px)] w-full items-center justify-center rounded-[var(--radius-lg)] bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 px-4">
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 to-emerald-400 animate-pulse sm:h-16 sm:w-16">
        <svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <p className="text-sm text-gray-600 sm:text-base">{message}</p>
    </div>
  </div>
);

export default LoadingScreen;
