'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DeliveryItem, LineMessage } from './types';
import { LineMessageEditor } from './LineMessageEditor';
import { LineMessageRenderer } from './LineMessageRenderer';

interface DeliveryModalProps {
  date: string;
  initialSegmentIds: string[];
  delivery: DeliveryItem | null;
  onSave: (delivery: DeliveryItem) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function DeliveryModal({
  date,
  initialSegmentIds,
  delivery,
  onSave,
  onDelete,
  onClose,
}: DeliveryModalProps) {
  const type: DeliveryItem['type'] = delivery?.type || 'message';
  const [scheduleLabel, setScheduleLabel] = useState(
    delivery?.scheduleLabel !== undefined
      ? delivery.scheduleLabel
      : [delivery?.date || date, delivery?.time].filter(Boolean).join(' ')
  );
  const selectedSegmentIds = delivery?.segmentIds?.length
    ? delivery.segmentIds
    : delivery?.segmentId
      ? [delivery.segmentId]
      : initialSegmentIds;
  const [messages, setMessages] = useState<LineMessage[]>(() => {
    if (delivery?.messages?.length) return delivery.messages;
    const legacyMessage = delivery?.description?.trim();
    return legacyMessage
      ? [{ id: `legacy-description-${delivery?.id || 'new'}`, type: 'text', text: legacyMessage }]
      : [];
  });
  const [notificationText, setNotificationText] = useState(delivery?.notificationText || '');

  const handleSave = () => {
    if (selectedSegmentIds.length === 0) return;

    const newDelivery: DeliveryItem = {
      id: delivery?.id || crypto.randomUUID(),
      date: delivery?.date || date,
      startDate: delivery?.startDate || delivery?.date || date,
      endDate: delivery?.endDate || delivery?.date || date,
      time: delivery?.time,
      scheduleLabel: scheduleLabel.trim(),
      segmentId: selectedSegmentIds[0], // 後方互換性
      segmentIds: selectedSegmentIds,
      title: delivery?.title || scheduleLabel.trim() || 'LINE配信',
      type,
      messages: messages.length > 0 ? messages : undefined,
      notificationText: notificationText.trim() || undefined,
    };

    onSave(newDelivery);
  };


  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="mx-4 flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ヘッダー */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">
              {delivery ? '配信内容編集' : '配信内容追加'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* フォーム */}
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid h-full min-h-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_394px]">
            <div className="space-y-4 overflow-y-auto pr-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 配信日時 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              配信日時
            </label>
            <input
              type="text"
              value={scheduleLabel}
              onChange={(event) => setScheduleLabel(event.target.value)}
              placeholder="例: 登録直後、登録後5分、3日目 20:00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* LINE メッセージ */}
          <LineMessageEditor
            messages={messages}
            onChange={setMessages}
            notificationText={notificationText}
            onNotificationTextChange={setNotificationText}
          />

            </div>

            <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-700">LINEプレビュー</h4>
              </div>
              {messages.length > 0 ? (
                <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-lg bg-white shadow-sm">
                  <LineMessageRenderer
                    messages={messages}
                    notificationText={notificationText}
                    maxWidth={320}
                  />
                </div>
              ) : (
                <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 text-center text-sm text-slate-400">
                  左側でLINEメッセージを入力すると、ここにプレビューが表示されます
                </div>
              )}
            </aside>
          </div>
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={selectedSegmentIds.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
