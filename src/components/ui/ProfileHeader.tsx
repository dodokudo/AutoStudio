'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

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
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!userId || userId === 'demo-user') {
      setProfile({
        id: 'demo',
        username: 'autostudio_demo',
        name: 'AutoStudio Demo',
        followers_count: 12500,
        follows_count: 850,
        media_count: 142,
        biography: 'Instagram リール分析と台本生成を自動化するツール',
        website: 'https://autostudio.example.com',
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
        setProfile({
          id: userId,
          username: 'autostudio_user',
          name: 'AutoStudio User',
          followers_count: 0,
          follows_count: 0,
          media_count: 0,
          biography: '',
          website: '',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <Card className={classNames('flex items-center gap-3', className)}>
        <div className="h-16 w-16 rounded-full bg-[color:var(--color-surface-muted)] animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 rounded bg-[color:var(--color-surface-muted)] animate-pulse" />
          <div className="h-4 w-24 rounded bg-[color:var(--color-surface-muted)] animate-pulse" />
        </div>
      </Card>
    );
  }

  if (!profile) {
    return null;
  }

  const displayName = profile.name || profile.username;
  const stats = [
    { label: 'フォロワー', value: profile.followers_count.toLocaleString() },
    { label: '投稿数', value: profile.media_count.toLocaleString() },
    { label: 'フォロー中', value: profile.follows_count.toLocaleString() },
  ];

  return (
    <Card className={classNames('flex flex-col gap-4 md:flex-row md:items-start', className)}>
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[color:var(--color-surface-muted)] text-center text-lg font-semibold text-[color:var(--color-text-primary)]">
          {!imageError && profile.profile_picture_url ? (
            <Image
              src={profile.profile_picture_url}
              alt={displayName}
              width={64}
              height={64}
              className="h-16 w-16 object-cover"
              onError={() => setImageError(true)}
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">{displayName}</h1>
          <p className="text-sm text-[color:var(--color-text-muted)]">@{profile.username}</p>
          {profile.biography ? (
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">{profile.biography}</p>
          ) : null}
          {profile.website ? (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-sm text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
            >
              {profile.website}
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm text-[color:var(--color-text-secondary)]"
          >
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">{stat.label}</p>
            <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">{stat.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
