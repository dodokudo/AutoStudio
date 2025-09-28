'use client';

import { useState } from 'react';

interface GeneratedPost {
  planId: string;
  templateId: string;
  theme: string;
  scheduledTime: string;
  mainPost: string;
  comments: string[];
}

export function IndividualPostCard() {
  const [theme, setTheme] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const [editableContent, setEditableContent] = useState<{
    mainText: string;
    comments: { order: number; text: string }[];
    scheduledTime: string;
  } | null>(null);

  const handleGenerate = async () => {
    if (!theme.trim()) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/threads/generate-individual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ theme: theme.trim() }),
      });

      if (!response.ok) {
        throw new Error('投稿生成に失敗しました');
      }

      const data = await response.json();
      const post = data.result;

      setGeneratedPost(post);
      setEditableContent({
        mainText: post.mainPost,
        comments: post.comments.map((text: string, index: number) => ({ order: index + 1, text })),
        scheduledTime: post.scheduledTime,
      });

      // 生成成功時はテーマをクリア
      setTheme('');
    } catch (error) {
      console.error('Individual post generation error:', error);
      alert('投稿生成中にエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedPost || !editableContent) return;

    try {
      const response = await fetch('/api/plans/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: generatedPost.planId,
          status: 'draft',
          mainText: editableContent.mainText,
          comments: editableContent.comments,
          scheduledTime: editableContent.scheduledTime,
        }),
      });

      if (!response.ok) {
        throw new Error('投稿の保存に失敗しました');
      }

      alert('投稿が保存されました！');
    } catch (error) {
      console.error('Save error:', error);
      alert('保存中にエラーが発生しました');
    }
  };

  const handleApprove = async () => {
    if (!generatedPost || !editableContent) return;

    setIsPosting(true);
    try {
      // 投稿をapprovedステータスに更新
      const response = await fetch('/api/plans/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: generatedPost.planId,
          status: 'approved',
          mainText: editableContent.mainText,
          comments: editableContent.comments,
          scheduledTime: editableContent.scheduledTime,
        }),
      });

      if (!response.ok) {
        throw new Error('投稿の承認に失敗しました');
      }

      alert('投稿が承認されました！スケジュール時間に自動投稿されます。');

      // リセット
      setGeneratedPost(null);
      setEditableContent(null);
    } catch (error) {
      console.error('Post approval error:', error);
      alert('投稿承認中にエラーが発生しました');
    } finally {
      setIsPosting(false);
    }
  };

  const scheduleOptions = Array.from({ length: 48 }).map((_, index) => {
    const baseMinutes = index * 30;
    const hour = Math.floor(baseMinutes / 60).toString().padStart(2, '0');
    const minute = (baseMinutes % 60).toString().padStart(2, '0');
    return `${hour}:${minute}`;
  });

  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
        <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]">
            🎯
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">個別投稿生成</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
              カスタムテーマで1つの投稿を生成
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左側: テーマ入力 */}
          <div className="space-y-6">
            <div>
              <label htmlFor="theme" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                テーマ・内容
              </label>
              <textarea
                id="theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例: AIの最新動向について、副業で月10万円稼ぐ方法、効率的なタスク管理術..."
                className="w-full px-4 py-3 border border-white/30 rounded-2xl bg-white/70 backdrop-blur-sm text-slate-700 dark:bg-white/10 dark:border-white/20 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-[0_8px_16px_rgba(99,102,241,0.1)] resize-none placeholder:text-slate-400"
                rows={6}
                disabled={isGenerating}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={!theme.trim() || isGenerating}
              className={`w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-300 ${
                !theme.trim() || isGenerating
                  ? 'bg-slate-200/60 text-slate-400 cursor-not-allowed dark:bg-slate-700/40 dark:text-slate-500'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 focus:ring-2 focus:ring-indigo-500 shadow-[0_16px_32px_rgba(99,102,241,0.3)] hover:shadow-[0_20px_40px_rgba(99,102,241,0.4)] transform hover:scale-[1.02]'
              }`}
            >
              {isGenerating ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  生成中...
                </div>
              ) : (
                '投稿を生成'
              )}
            </button>
          </div>

          {/* 右側: 出力結果と投稿機能 */}
          <div className="space-y-6">
            {generatedPost && editableContent ? (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-white">生成結果</h4>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                      下書き
                    </span>
                  </div>

                  {/* スケジュール時間 */}
                  <div>
                    <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-slate-600 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-200/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">時間</span>
                      <input
                        className="w-20 bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-white"
                        value={editableContent.scheduledTime}
                        onChange={(e) => setEditableContent({
                          ...editableContent,
                          scheduledTime: e.target.value
                        })}
                        list={`time-options-individual`}
                      />
                      <datalist id={`time-options-individual`}>
                        {scheduleOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </label>
                  </div>

                  {/* メイン投稿 */}
                  <div className="relative">
                    <textarea
                      value={editableContent.mainText}
                      onChange={(e) => setEditableContent({
                        ...editableContent,
                        mainText: e.target.value
                      })}
                      className={`min-h-[120px] w-full rounded-2xl border p-4 text-sm leading-relaxed shadow-inner outline-none transition focus:ring-2 dark:bg-white/10 dark:text-slate-100 ${
                        editableContent.mainText.length > 500
                          ? 'border-rose-400 bg-rose-50 focus:ring-rose-200 dark:border-rose-500 dark:bg-rose-500/10'
                          : 'border-slate-200 bg-white focus:border-indigo-300 focus:ring-indigo-200 dark:border-slate-700'
                      }`}
                      placeholder="メイン投稿の内容を入力してください"
                    />
                    <div className={`absolute bottom-3 right-3 text-xs ${
                      editableContent.mainText.length > 500 ? 'text-rose-600' : 'text-slate-400'
                    }`}>
                      {editableContent.mainText.length}/500
                    </div>
                  </div>

                  {/* コメント */}
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">コメント</h4>
                    <div className="space-y-4">
                      {editableContent.comments.map((comment, index) => (
                        <div key={index} className="relative">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              コメント {index + 1}
                            </span>
                          </div>
                          <textarea
                            value={comment.text}
                            onChange={(e) => {
                              const newComments = [...editableContent.comments];
                              newComments[index] = { ...comment, text: e.target.value };
                              setEditableContent({
                                ...editableContent,
                                comments: newComments
                              });
                            }}
                            className={`min-h-[100px] w-full rounded-2xl border p-4 text-sm leading-relaxed shadow-inner outline-none transition focus:ring-2 dark:bg-white/10 dark:text-slate-100 ${
                              comment.text.length > 500
                                ? 'border-rose-400 bg-rose-50 focus:ring-rose-200 dark:border-rose-500 dark:bg-rose-500/10'
                                : 'border-slate-200 bg-white focus:border-indigo-300 focus:ring-indigo-200 dark:border-slate-700'
                            }`}
                            placeholder={`コメント ${index + 1} の内容を入力してください`}
                          />
                          <div className={`absolute bottom-3 right-3 text-xs ${
                            comment.text.length > 500 ? 'text-rose-600' : 'text-slate-400'
                          }`}>
                            {comment.text.length}/500
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ボタン群 */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-200">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isPosting}
                      className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-200 disabled:opacity-60 dark:bg-emerald-500/20 dark:text-emerald-200"
                    >
                      {isPosting ? '承認中…' : '承認'}
                    </button>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                    下書き
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px] text-slate-500 dark:text-slate-400">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    📝
                  </div>
                  <p>投稿を生成すると結果がここに表示されます</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}