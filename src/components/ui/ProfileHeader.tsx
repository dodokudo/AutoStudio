'use client';

import { useState, useEffect } from 'react';
import { StatPill } from './StatPill';

interface ProfileData {
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  biography?: string;
  website?: string;
}

interface ProfileHeaderProps {
  userId?: string;
  className?: string;
}

export function ProfileHeader({ userId, className = '' }: ProfileHeaderProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || userId === 'demo-user') {
      // デモデータを設定
      setProfile({
        id: 'demo',
        username: 'autostudio_demo',
        name: 'AutoStudio Demo',
        followers_count: 12500,
        follows_count: 850,
        media_count: 142,
        biography: 'Instagram リール分析と台本生成を自動化するツール',
        website: 'https://autostudio.example.com'
      });
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/instagram/profile/${userId}`);
        const result = await response.json();

        if (result.success && result.profile) {
          setProfile(result.profile);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
        // フォールバックとしてデモデータを使用
        setProfile({
          id: userId,
          username: 'autostudio_user',
          name: 'AutoStudio User',
          followers_count: 0,
          follows_count: 0,
          media_count: 0,
          biography: '',
          website: ''
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <div className="w-16 h-16 rounded-full bg-slate-700 animate-pulse"></div>
          <div className="flex-1">
            <div className="h-5 bg-slate-700 rounded w-32 mb-2 animate-pulse"></div>
            <div className="h-4 bg-slate-700 rounded w-24 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const displayName = profile.name || profile.username;
  const profileImageUrl = profile.profile_picture_url || '/default-avatar.jpg';

  return (
    <div className={`bg-slate-900/60 border border-slate-800 rounded-lg p-6 ${className}`}>
      <div className="flex items-start space-x-4">
        {/* プロフィール画像 */}
        <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-700 flex-shrink-0">
          <img
            src={profileImageUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.classList.add('bg-gradient-to-r', 'from-indigo-500', 'to-purple-500');
              const fallback = e.currentTarget.parentElement?.querySelector('.fallback');
              if (fallback) {
                fallback.classList.remove('hidden');
              }
            }}
          />
          <div className="fallback hidden w-full h-full flex items-center justify-center text-white font-bold text-xl">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* アカウント情報 */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">
            {displayName}
          </h1>
          <p className="text-sm text-slate-400 truncate mb-3">
            @{profile.username}
          </p>

          {/* 統計情報 */}
          <div className="flex flex-wrap gap-2">
            <StatPill
              icon="👥"
              value={profile.followers_count}
              color="blue"
            />
            <StatPill
              icon="📄"
              value={profile.media_count}
              color="green"
            />
            <StatPill
              icon="👤"
              value={profile.follows_count}
              color="purple"
            />
          </div>

          {/* バイオ */}
          {profile.biography && (
            <div className="mt-3">
              <p className="text-sm text-slate-300 line-clamp-2">
                {profile.biography}
              </p>
            </div>
          )}

          {/* ウェブサイト */}
          {profile.website && (
            <div className="mt-2">
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {profile.website}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}