'use client';

import { useState } from 'react';
import { LineMessage, LineMessageType, FlexBlock, FlexButton, CarouselColumn } from './types';
import { LineMessageRenderer } from './LineMessageRenderer';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MSG_TYPES: { type: LineMessageType; label: string }[] = [
  { type: 'text', label: 'テキスト' },
  { type: 'image', label: '画像' },
  { type: 'audio', label: '音声' },
  { type: 'video', label: '動画' },
  { type: 'flex', label: 'フレックス' },
  { type: 'carousel', label: 'カルーセル' },
];

interface LineMessageEditorProps {
  messages: LineMessage[];
  onChange: (messages: LineMessage[]) => void;
  notificationText: string;
  onNotificationTextChange: (text: string) => void;
}
export function LineMessageEditor({
  messages,
  onChange,
  notificationText,
  onNotificationTextChange,
}: LineMessageEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  const addMessage = (type: LineMessageType) => {
    const newMsg: LineMessage = { id: genId(), type };
    if (type === 'carousel') {
      newMsg.columns = [{ id: genId() }];
    }
    if (type === 'flex') {
      newMsg.flexBlocks = [{ id: genId(), type: 'text', html: '' }];
    }
    onChange([...messages, newMsg]);
  };

  const updateMessage = (idx: number, updates: Partial<LineMessage>) => {
    onChange(messages.map((m, i) => i === idx ? { ...m, ...updates } : m));
  };

  const removeMessage = (idx: number) => {
    onChange(messages.filter((_, i) => i !== idx));
  };

  const moveMessage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= messages.length) return;
    const next = [...messages];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          LINE メッセージ
        </label>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {showPreview ? '編集に戻る' : 'プレビュー'}
          </button>
        )}
      </div>

      {/* メッセージ追加ボタン */}
      <div className="flex gap-1.5 mb-3">
        {MSG_TYPES.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => addMessage(type)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-gray-100 px-2.5 py-1 text-xs transition hover:bg-gray-200"
          >
            <span className="text-gray-400">+</span> {label}
          </button>
        ))}
      </div>

      {showPreview && messages.length > 0 ? (
        <div className="bg-gray-50 rounded-lg p-3 flex justify-center">
          <LineMessageRenderer
            messages={messages}
            maxWidth={280}
            notificationText={notificationText || undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <MessageCard
              key={msg.id}
              message={msg}
              index={idx}
              total={messages.length}
              onUpdate={(updates) => updateMessage(idx, updates)}
              onRemove={() => removeMessage(idx)}
              onMove={(dir) => moveMessage(idx, dir)}
            />
          ))}
        </div>
      )}

      {messages.length > 0 && messages.some(m => m.type !== 'text') && (
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">
            プッシュ通知テキスト
          </label>
          <input
            type="text"
            value={notificationText}
            onChange={(e) => onNotificationTextChange(e.target.value)}
            placeholder="通知バーに表示されるテキスト"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            画像・音声・動画・フレックス・カルーセルは通知バーに内容を表示できないため、代替テキストを設定してください
          </p>
        </div>
      )}
    </div>
  );
}

// --- メッセージカード ---
function MessageCard({
  message,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  message: LineMessage;
  index: number;
  total: number;
  onUpdate: (updates: Partial<LineMessage>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const typeLabel = MSG_TYPES.find(t => t.type === message.type)?.label || message.type;

  return (
    <div>
      {index > 0 && <hr className="border-gray-200 mb-3" />}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {index + 1}. {typeLabel}
        </span>
        <div className="flex items-center gap-1">
          {index > 0 && (
            <button type="button" onClick={() => onMove(-1)} className="p-1 text-gray-400 hover:text-gray-600 text-sm">↑</button>
          )}
          {index < total - 1 && (
            <button type="button" onClick={() => onMove(1)} className="p-1 text-gray-400 hover:text-gray-600 text-sm">↓</button>
          )}
          <button type="button" onClick={onRemove} className="p-1 text-red-400 hover:text-red-600 text-sm">✕</button>
        </div>
      </div>

      {message.type === 'text' && <TextFields message={message} onUpdate={onUpdate} />}
      {message.type === 'image' && <ImageFields message={message} onUpdate={onUpdate} />}
      {message.type === 'audio' && <AudioFields message={message} onUpdate={onUpdate} />}
      {message.type === 'video' && <VideoFields message={message} onUpdate={onUpdate} />}
      {message.type === 'flex' && <FlexFields message={message} onUpdate={onUpdate} />}
      {message.type === 'carousel' && <CarouselFields message={message} onUpdate={onUpdate} />}
    </div>
  );
}

// --- テキスト ---
function TextFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  return (
    <textarea
      value={message.text || ''}
      onChange={(e) => onUpdate({ text: e.target.value })}
      placeholder="メッセージ本文"
      rows={12}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
    />
  );
}

// --- 画像 ---
// --- リンク先ページ ---
function ImagePicker({
  value,
  onChange,
  onRemove,
}: {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);

  const handleSelect = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload-image', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`upload failed: ${response.status}`);
      const data = await response.json();
      if (!data.url) throw new Error('no url in response');
      onChange(data.url);
    } catch (uploadError) {
      console.warn('[LineMessageEditor] image upload failed, using local data:', uploadError);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(file);
      });
      onChange(dataUrl);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          {isUploading ? 'アップロード中...' : value ? '画像を変更' : '画像を選択'}
          <input
            type="file"
            accept="image/*"
            disabled={isUploading}
            onChange={(e) => {
              void handleSelect(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="hidden"
          />
        </label>
        {value && onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">
            削除
          </button>
        )}
      </div>
      {value && (
        <img
          src={value}
          alt=""
          className="mt-2 max-h-24 rounded object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function ImageFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  return (
    <ImagePicker
      value={message.imageUrl}
      onChange={(imageUrl) => onUpdate({ imageUrl })}
      onRemove={() => onUpdate({ imageUrl: undefined })}
    />
  );
}

// --- 音声 ---
function AudioFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-2 text-amber-700 mb-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        <span className="text-xs font-medium">音声メッセージ</span>
      </div>
      <input
        type="text"
        value={message.text || ''}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="ラベル（例: 【音声メッセージ】）"
        className="w-full px-3 py-1.5 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent"
      />
    </div>
  );
}

// --- 動画 ---
function VideoFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center gap-2 text-red-600 mb-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <span className="text-xs font-medium">動画メッセージ</span>
      </div>
      <input
        type="text"
        value={message.text || ''}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="ラベル（例: 【動画メッセージ】）"
        className="w-full px-3 py-1.5 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-transparent"
      />
    </div>
  );
}

// --- フレックス ---
function FlexFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  const legacyBlocks: FlexBlock[] = [
    ...(message.flexImageUrl ? [{ id: `${message.id}-image`, type: 'image' as const, imageUrl: message.flexImageUrl }] : []),
    ...(message.flexTitle ? [{ id: `${message.id}-title`, type: 'title' as const, title: message.flexTitle }] : []),
    ...(message.flexBody ? [{ id: `${message.id}-text`, type: 'text' as const, html: message.flexBody }] : []),
    ...(message.flexButtons || []).map((button, index) => ({
      id: `${message.id}-button-${index}`,
      type: 'button' as const,
      label: button.label,
      action: button,
      buttonColor: button.color,
    })),
  ];
  const blocks = message.flexBlocks || (legacyBlocks.length > 0
    ? legacyBlocks
    : [{ id: `${message.id}-text`, type: 'text' as const, html: '' }]);
  const blockLabels: Record<FlexBlock['type'], string> = {
    title: 'タイトル',
    text: 'テキスト',
    image: '画像',
    button: 'ボタン',
    video: '動画',
  };

  const commitBlocks = (nextBlocks: FlexBlock[]) => {
    onUpdate({
      flexBlocks: nextBlocks,
      flexTitle: undefined,
      flexBody: undefined,
      flexImageUrl: undefined,
      flexButtons: undefined,
    });
  };

  const addBlock = (type: 'title' | 'text' | 'image' | 'button') => {
    const block: FlexBlock = type === 'title'
      ? { id: genId(), type, title: '' }
      : type === 'text'
        ? { id: genId(), type, html: '' }
        : type === 'image'
          ? { id: genId(), type, imageUrl: '' }
          : {
              id: genId(),
              type,
              label: '',
              action: { label: '', type: 'uri', value: '' },
              buttonColor: '#06C755',
            };
    commitBlocks([...blocks, block]);
  };

  const updateBlock = (index: number, updates: Partial<FlexBlock>) => {
    commitBlocks(blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...updates } : block));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const nextBlocks = [...blocks];
    [nextBlocks[index], nextBlocks[target]] = [nextBlocks[target], nextBlocks[index]];
    commitBlocks(nextBlocks);
  };

  const removeBlock = (index: number) => {
    if (blocks.length <= 1) return;
    commitBlocks(blocks.filter((_, blockIndex) => blockIndex !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(['title', 'text', 'image', 'button'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addBlock(type)}
            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700 transition hover:bg-gray-200"
          >
            + {blockLabels[type]}
          </button>
        ))}
      </div>

      {blocks.map((block, index) => (
        <div key={block.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">{index + 1}. {blockLabels[block.type]}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlock(index, -1)}
                disabled={index === 0}
                aria-label={`${blockLabels[block.type]}を上へ`}
                className="px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-25"
              >↑</button>
              <button
                type="button"
                onClick={() => moveBlock(index, 1)}
                disabled={index === blocks.length - 1}
                aria-label={`${blockLabels[block.type]}を下へ`}
                className="px-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-25"
              >↓</button>
              <button
                type="button"
                onClick={() => removeBlock(index)}
                disabled={blocks.length <= 1}
                aria-label={`${blockLabels[block.type]}を削除`}
                className="px-1 text-xs text-red-400 hover:text-red-600 disabled:opacity-25"
              >✕</button>
            </div>
          </div>

          {block.type === 'title' && (
            <input
              type="text"
              value={block.title || ''}
              onChange={(e) => updateBlock(index, { title: e.target.value })}
              placeholder="タイトル"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          )}

          {block.type === 'text' && (
            <textarea
              value={block.html || ''}
              onChange={(e) => updateBlock(index, { html: e.target.value })}
              placeholder="テキスト"
              rows={12}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          )}

          {block.type === 'image' && (
            <ImagePicker
              value={block.imageUrl}
              onChange={(imageUrl) => updateBlock(index, { imageUrl })}
              onRemove={() => updateBlock(index, { imageUrl: undefined })}
            />
          )}

          {block.type === 'button' && (
            <div className="flex min-w-0 items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
              <input
                type="text"
                value={block.label || ''}
                onChange={(e) => updateBlock(index, {
                  label: e.target.value,
                  action: { ...(block.action || { type: 'uri', value: '' }), label: e.target.value },
                })}
                placeholder="ボタン文言"
                className="min-w-0 flex-1 px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <span className="px-1 text-gray-300">|</span>
              <input
                type="text"
                value={block.action?.value || ''}
                onChange={(e) => updateBlock(index, {
                  action: { ...(block.action || { label: block.label || '', type: 'uri' }), value: e.target.value },
                })}
                placeholder="リンクURL"
                className="min-w-0 flex-1 px-2.5 py-1.5 text-xs text-gray-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- カルーセル ---
function CarouselFields({ message, onUpdate }: { message: LineMessage; onUpdate: (u: Partial<LineMessage>) => void }) {
  const columns = message.columns || [];

  const addColumn = () => {
    onUpdate({ columns: [...columns, { id: genId() }] });
  };

  const updateColumn = (idx: number, updates: Partial<CarouselColumn>) => {
    onUpdate({ columns: columns.map((c, i) => i === idx ? { ...c, ...updates } : c) });
  };

  const removeColumn = (idx: number) => {
    if (columns.length <= 1) return;
    onUpdate({ columns: columns.filter((_, i) => i !== idx) });
  };

  const addAction = (colIdx: number) => {
    const col = columns[colIdx];
    updateColumn(colIdx, { actions: [...(col.actions || []), { label: '', type: 'uri', value: '' }] });
  };

  const updateAction = (colIdx: number, actIdx: number, updates: Partial<FlexButton>) => {
    const col = columns[colIdx];
    const actions = (col.actions || []).map((a, i) => i === actIdx ? { ...a, ...updates } : a);
    updateColumn(colIdx, { actions });
  };

  const removeAction = (colIdx: number, actIdx: number) => {
    const col = columns[colIdx];
    updateColumn(colIdx, { actions: (col.actions || []).filter((_, i) => i !== actIdx) });
  };

  return (
    <div className="space-y-2">
      {columns.map((col, idx) => (
        <div key={col.id} className="border border-gray-100 rounded-lg p-2 bg-gray-50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-400">カラム {idx + 1}</span>
            {columns.length > 1 && (
              <button type="button" onClick={() => removeColumn(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            )}
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              value={col.title || ''}
              onChange={(e) => updateColumn(idx, { title: e.target.value })}
              placeholder="タイトル"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500"
            />
            <textarea
              value={col.text || ''}
              onChange={(e) => updateColumn(idx, { text: e.target.value })}
              placeholder="テキスト"
              rows={1}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <ImagePicker
              value={col.imageUrl}
              onChange={(imageUrl) => updateColumn(idx, { imageUrl })}
              onRemove={() => updateColumn(idx, { imageUrl: undefined })}
            />
            {/* カラムアクション */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">アクション</span>
                <button type="button" onClick={() => addAction(idx)} className="text-xs text-blue-600 hover:text-blue-800">+ 追加</button>
              </div>
              {(col.actions || []).map((action, actIdx) => (
                <div key={actIdx} className="flex gap-1 mt-1.5 items-center">
                  <div className="flex-1 min-w-0 flex items-center border border-gray-200 rounded overflow-hidden">
                    <input
                      type="text"
                      value={action.label}
                      onChange={(e) => updateAction(idx, actIdx, { label: e.target.value })}
                      placeholder="ボタン文言"
                      className="w-1/3 min-w-0 px-2 py-1 text-xs focus:outline-none"
                    />
                    <span className="text-gray-300 px-0.5">|</span>
                    <input
                      type="text"
                      value={action.value || ''}
                      onChange={(e) => updateAction(idx, actIdx, { value: e.target.value })}
                      placeholder="リンクURL"
                      className="flex-1 min-w-0 px-2 py-1 text-xs text-gray-500 focus:outline-none"
                    />
                  </div>
                  <button type="button" onClick={() => removeAction(idx, actIdx)} className="text-red-400 hover:text-red-600 text-xs px-0.5 flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addColumn}
        className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition"
      >
        + カラム追加
      </button>
    </div>
  );
}
