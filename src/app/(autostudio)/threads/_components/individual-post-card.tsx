'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface GeneratedPost {
  planId: string;
  templateId: string;
  theme: string;
  scheduledTime: string;
  mainPost: string;
  comments: string[];
}

type PostType = 'ai-tips' | 'threads-operation';

export function IndividualPostCard() {
  const [postType, setPostType] = useState<PostType>('threads-operation');
  const [theme, setTheme] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const [editableContent, setEditableContent] = useState<{
    mainText: string;
    comments: { order: number; text: string }[];
    scheduledTime: string;
  } | null>(null);
  const [postNow, setPostNow] = useState(false);

  const scheduleOptions = Array.from({ length: 48 }).map((_, index) => {
    const baseMinutes = index * 30;
    const hour = Math.floor(baseMinutes / 60).toString().padStart(2, '0');
    const minute = (baseMinutes % 60).toString().padStart(2, '0');
    return `${hour}:${minute}`;
  });

  // Add "Post Now" option
  const scheduleOptionsWithNow = ['いますぐ投稿', ...scheduleOptions];

  const resetPostState = () => {
    setGeneratedPost(null);
    setEditableContent(null);
    setPostNow(false);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const apiEndpoint = postType === 'ai-tips'
        ? '/api/threads/generate-individual'
        : '/api/threads/generate-individual-operation';

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme.trim() || undefined }),
      });

      if (!response.ok) {
        throw new Error('投稿生成に失敗しました');
      }

      const data = await response.json();
      const post = data.result as GeneratedPost;

      setGeneratedPost(post);
      setEditableContent({
        mainText: post.mainPost,
        comments: post.comments.map((text, index) => ({ order: index + 1, text })),
        scheduledTime: post.scheduledTime ?? '07:00',
      });
      setTheme('');
    } catch (error) {
      console.error('Individual post generation error:', error);
      alert('投稿生成中にエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveOrApprove = async (status: 'draft' | 'approved') => {
    if (!generatedPost || !editableContent) return;

    const payload = {
      planId: generatedPost.planId,
      status,
      mainText: editableContent.mainText,
      comments: editableContent.comments,
      scheduledTime: editableContent.scheduledTime === 'いますぐ投稿' ? 'now' : editableContent.scheduledTime,
      postNow: postNow || editableContent.scheduledTime === 'いますぐ投稿',
    };

    try {
      if (status === 'approved') {
        setIsPosting(true);
      }

      const response = await fetch('/api/plans/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('投稿の更新に失敗しました');
      }

      const data = await response.json();
      alert(data.message || (status === 'approved' ? '投稿を承認しました。' : '下書きを保存しました。'));
      if (status === 'approved') {
        resetPostState();
      }
    } catch (error) {
      console.error('Plan update failed:', error);
      alert('投稿の保存または承認に失敗しました');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Card className="w-full">
      <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">個別投稿作成</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            任意のテーマから1件の投稿案を生成し、そのまま編集・承認できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1">
            <button
              onClick={() => setPostType('ai-tips')}
              disabled={isGenerating || isPosting}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                postType === 'ai-tips'
                  ? 'bg-[color:var(--color-accent)] text-white'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
              } disabled:opacity-50`}
            >
              AI活用系
            </button>
            <button
              onClick={() => setPostType('threads-operation')}
              disabled={isGenerating || isPosting}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                postType === 'threads-operation'
                  ? 'bg-[color:var(--color-accent)] text-white'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
              } disabled:opacity-50`}
            >
              Threads運用系
            </button>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 min-w-0">
        <div className="space-y-4 min-w-0">
          <label className="block text-sm font-medium text-[color:var(--color-text-primary)]">テーマ・内容（任意）</label>
          <textarea
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            rows={6}
            placeholder={postType === 'ai-tips'
              ? "例: AI音声入力で資料作成を時短する具体的な手順\n\n空欄の場合は自動でテーマが選択されます"
              : "例: Threadsのフォロワーを増やすための投稿戦略\n\n空欄の場合は自動でテーマが選択されます"
            }
            className="w-full max-w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            disabled={isGenerating}
          />
          <Button onClick={handleGenerate} disabled={isGenerating} className="w-full sm:w-auto">
            {isGenerating ? '生成中…' : '投稿案を生成'}
          </Button>
        </div>

        <div className="space-y-4 min-w-0">
          {generatedPost && editableContent ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 min-w-0">
                <label className="text-sm font-medium text-[color:var(--color-text-primary)] min-w-0">
                  配信時間
                  <select
                    className="mt-2 w-full max-w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                    value={editableContent.scheduledTime}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPostNow(value === 'いますぐ投稿');
                      setEditableContent((current) =>
                        current ? { ...current, scheduledTime: value } : current,
                      );
                    }}
                  >
                    {scheduleOptionsWithNow.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-sm text-[color:var(--color-text-secondary)]">
                  <p className="font-medium">テンプレート</p>
                  <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">{generatedPost.templateId}</p>
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                <label className="text-sm font-medium text-[color:var(--color-text-primary)] min-w-0 block">
                  本文
                  <textarea
                    className="mt-2 w-full max-w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                    rows={6}
                    value={editableContent.mainText}
                    onChange={(event) =>
                      setEditableContent((current) =>
                        current ? { ...current, mainText: event.target.value } : current,
                      )
                    }
                  />
                </label>
                {editableContent.comments.map((comment) => (
                  <label key={comment.order} className="text-sm font-medium text-[color:var(--color-text-primary)] min-w-0 block">
                    コメント {comment.order}
                    <textarea
                      className="mt-2 w-full max-w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] h-72 md:h-48"
                      value={comment.text}
                      onChange={(event) =>
                        setEditableContent((current) =>
                          current
                            ? {
                                ...current,
                                comments: current.comments.map((item) =>
                                  item.order === comment.order
                                    ? { ...item, text: event.target.value }
                                    : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2 w-full max-w-full">
                <Button variant="secondary" onClick={() => handleSaveOrApprove('draft')} disabled={isPosting} className="w-full sm:w-auto">
                  下書きを保存
                </Button>
                <Button onClick={() => handleSaveOrApprove('approved')} disabled={isPosting} className="w-full sm:w-auto">
                  {isPosting ? '承認処理中…' : '承認して配信'}
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-6 text-sm text-[color:var(--color-text-secondary)]">
              投稿案はまだ生成されていません。左側でテーマを入力（任意）して生成を開始してください。
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
