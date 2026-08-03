'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Connection, DeliveryItem, Funnel, LineMessage, Segment } from './types';
import { DeliveryModal } from './DeliveryModal';
import { LineMessageRenderer } from './LineMessageRenderer';

export interface DeliveryCanvasRef {
  addDeliveryNode: () => void;
  addSegment: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  autoLayout: () => void;
  getHistoryState: () => { index: number; length: number };
}

interface DeliveryGridProps {
  funnel: Funnel;
  onUpdate: (funnel: Funnel) => void;
  allowStructureEditing?: boolean;
  allowPageEditing?: boolean;
  showStructureControls?: boolean;
}

interface HistoryState {
  deliveries: DeliveryItem[];
  connections: Connection[];
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDeliverySegmentIds(delivery: DeliveryItem): string[] {
  return delivery.segmentIds?.length ? delivery.segmentIds : [delivery.segmentId];
}

function getDeliveryTiming(delivery: DeliveryItem): string {
  if (delivery.scheduleLabel !== undefined) return delivery.scheduleLabel;
  return [delivery.date || delivery.startDate, delivery.time].filter(Boolean).join(' ');
}

function cloneHistoryState(deliveries: DeliveryItem[], connections: Connection[]): HistoryState {
  return JSON.parse(JSON.stringify({ deliveries, connections })) as HistoryState;
}

function getVisibleMessages(delivery: DeliveryItem): LineMessage[] {
  if (delivery.messages?.length) return delivery.messages;
  if (!delivery.description?.trim()) return [];

  return [{
    id: `legacy-description-${delivery.id}`,
    type: 'text',
    text: delivery.description.trim(),
  }];
}

function getPagePreviewSrc(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

    const host = url.hostname.toLowerCase();
    if (host === 'myfm.jp' || host.endsWith('.myfm.jp')) {
      return `/api/page-preview?url=${encodeURIComponent(url.toString())}`;
    }

    return url.toString();
  } catch {
    return '';
  }
}

function getSegmentPreviewUrls(segment: Segment | null): string[] {
  if (!segment) return [];
  if (segment.previewUrls?.length) return segment.previewUrls;
  return [segment.previewUrl || ''];
}

function getSegmentPreviewNames(segment: Segment | null, count: number): string[] {
  return Array.from({ length: count }, (_, index) => segment?.previewNames?.[index] || `ページ${index + 1}`);
}

const SEGMENT_COLORS = ['#6B7280', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

export const DeliveryGrid = forwardRef<DeliveryCanvasRef, DeliveryGridProps>(
  function DeliveryGrid({ funnel, onUpdate, allowStructureEditing = true, allowPageEditing = true, showStructureControls = true }, ref) {
    const segments = funnel.segments || [];
    const deliveries = funnel.deliveries || [];
    const connections = funnel.connections || [];
    const today = formatLocalDate(new Date());

    const [activeSegmentId, setActiveSegmentId] = useState(segments[0]?.id || '');
    const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [segmentContextMenu, setSegmentContextMenu] = useState<{ x: number; y: number; segmentId: string } | null>(null);
    const [renamingSegmentId, setRenamingSegmentId] = useState<string | null>(null);
    const [segmentNameDraft, setSegmentNameDraft] = useState('');
    const [previewUrlDrafts, setPreviewUrlDrafts] = useState<string[]>([]);
    const [previewNameDrafts, setPreviewNameDrafts] = useState<string[]>([]);
    const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryState[]>([
      cloneHistoryState(deliveries, connections),
    ]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const lastFunnelId = useRef(funnel.id);

    useEffect(() => {
      if (!segments.some((segment) => segment.id === activeSegmentId)) {
        setActiveSegmentId(segments[0]?.id || '');
      }
    }, [activeSegmentId, segments]);

    useEffect(() => {
      const activeSegment = segments.find((segment) => segment.id === activeSegmentId) || null;
      const previewUrls = getSegmentPreviewUrls(activeSegment);
      setPreviewUrlDrafts(previewUrls);
      setPreviewNameDrafts(getSegmentPreviewNames(activeSegment, previewUrls.length));
    }, [activeSegmentId, segments]);

    useEffect(() => {
      if (!segmentContextMenu) return;

      const closeMenu = () => setSegmentContextMenu(null);
      document.addEventListener('click', closeMenu);
      window.addEventListener('blur', closeMenu);
      window.addEventListener('resize', closeMenu);

      return () => {
        document.removeEventListener('click', closeMenu);
        window.removeEventListener('blur', closeMenu);
        window.removeEventListener('resize', closeMenu);
      };
    }, [segmentContextMenu]);

    useEffect(() => {
      if (lastFunnelId.current !== funnel.id) {
        lastFunnelId.current = funnel.id;
        setHistory([cloneHistoryState(funnel.deliveries || [], funnel.connections || [])]);
        setHistoryIndex(0);
        setEditingDeliveryId(null);
        setIsAddingNew(false);
      }
    }, [funnel.connections, funnel.deliveries, funnel.id]);

    const commitUpdate = useCallback((nextDeliveries: DeliveryItem[], nextConnections = connections) => {
      const snapshot = cloneHistoryState(nextDeliveries, nextConnections);
      setHistory((previous) => {
        const next = [...previous.slice(0, historyIndex + 1), snapshot];
        return next.length > 50 ? next.slice(-50) : next;
      });
      setHistoryIndex((previous) => Math.min(previous + 1, 49));
      onUpdate({
        ...funnel,
        deliveries: nextDeliveries,
        connections: nextConnections,
        updatedAt: new Date().toISOString(),
      });
    }, [connections, funnel, historyIndex, onUpdate]);

    const handleUndo = useCallback(() => {
      if (historyIndex <= 0) return;
      const previous = history[historyIndex - 1];
      setHistoryIndex((index) => index - 1);
      onUpdate({
        ...funnel,
        deliveries: cloneHistoryState(previous.deliveries, previous.connections).deliveries,
        connections: cloneHistoryState(previous.deliveries, previous.connections).connections,
        updatedAt: new Date().toISOString(),
      });
    }, [funnel, history, historyIndex, onUpdate]);

    const handleRedo = useCallback(() => {
      if (historyIndex >= history.length - 1) return;
      const next = history[historyIndex + 1];
      setHistoryIndex((index) => index + 1);
      onUpdate({
        ...funnel,
        deliveries: cloneHistoryState(next.deliveries, next.connections).deliveries,
        connections: cloneHistoryState(next.deliveries, next.connections).connections,
        updatedAt: new Date().toISOString(),
      });
    }, [funnel, history, historyIndex, onUpdate]);

    const addDeliveryNode = useCallback(() => {
      const selectedSegment = segments.find((segment) => segment.id === activeSegmentId);
      if (!selectedSegment || selectedSegment.contentMode === 'page') return;
      setEditingDeliveryId(null);
      setIsAddingNew(true);
    }, [activeSegmentId, segments]);

    const activeSegment = useMemo(
      () => segments.find((segment) => segment.id === activeSegmentId) || null,
      [activeSegmentId, segments]
    );

    const segmentDeliveries = useMemo(() => {
      return deliveries.filter((delivery) => getDeliverySegmentIds(delivery).includes(activeSegmentId));
    }, [activeSegmentId, deliveries]);

    const addSegment = useCallback((contentMode: 'delivery' | 'page') => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const sameTypeCount = segments.filter((segment) =>
        contentMode === 'page'
          ? segment.contentMode === 'page'
          : segment.contentMode !== 'page'
      ).length;
      const nextSegment: Segment = {
        id: `${contentMode === 'page' ? 'page' : 'segment'}-${suffix}`,
        name: contentMode === 'page' ? `ページ${sameTypeCount + 1}` : `セグメント${sameTypeCount + 1}`,
        color: SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length],
        isDefault: false,
        contentMode,
        previewUrls: contentMode === 'page' ? [''] : undefined,
        previewNames: contentMode === 'page' ? ['ページ1'] : undefined,
      };

      onUpdate({
        ...funnel,
        segments: [...segments, nextSegment],
        updatedAt: new Date().toISOString(),
      });
      setActiveSegmentId(nextSegment.id);
    }, [funnel, onUpdate, segments]);

    useImperativeHandle(ref, () => ({
      addDeliveryNode,
      addSegment: () => addSegment('delivery'),
      handleUndo,
      handleRedo,
      autoLayout: () => {},
      getHistoryState: () => ({ index: historyIndex, length: history.length }),
    }), [addDeliveryNode, addSegment, handleRedo, handleUndo, history.length, historyIndex]);

    const updateActivePageUrls = useCallback((previewUrls: string[], previewNames?: string[]) => {
      if (!activeSegment || activeSegment.contentMode !== 'page') return;
      const nextNames = previewNames || getSegmentPreviewNames(activeSegment, previewUrls.length);
      setPreviewUrlDrafts(previewUrls);
      setPreviewNameDrafts(nextNames);
      onUpdate({
        ...funnel,
        segments: segments.map((segment) =>
          segment.id === activeSegment.id
            ? { ...segment, previewUrl: previewUrls[0] || undefined, previewUrls, previewNames: nextNames }
            : segment
        ),
        updatedAt: new Date().toISOString(),
      });
    }, [activeSegment, funnel, onUpdate, segments]);

    const moveSegment = useCallback((sourceId: string, targetId: string) => {
      const sourceIndex = segments.findIndex((segment) => segment.id === sourceId);
      const targetIndex = segments.findIndex((segment) => segment.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

      const nextSegments = [...segments];
      const [movedSegment] = nextSegments.splice(sourceIndex, 1);
      nextSegments.splice(targetIndex, 0, movedSegment);
      onUpdate({
        ...funnel,
        segments: nextSegments,
        updatedAt: new Date().toISOString(),
      });
    }, [funnel, onUpdate, segments]);

    const startSegmentRename = useCallback((segmentId: string) => {
      const segment = segments.find((candidate) => candidate.id === segmentId);
      if (!segment) return;
      setSegmentNameDraft(segment.name);
      setRenamingSegmentId(segment.id);
      setSegmentContextMenu(null);
    }, [segments]);

    const saveSegmentName = useCallback((segmentId: string, name: string) => {
      const nextName = name.trim();
      setRenamingSegmentId(null);
      if (!nextName) return;

      onUpdate({
        ...funnel,
        segments: segments.map((segment) =>
          segment.id === segmentId ? { ...segment, name: nextName } : segment
        ),
        updatedAt: new Date().toISOString(),
      });
    }, [funnel, onUpdate, segments]);

    const duplicateSegment = useCallback((segmentId: string) => {
      const sourceSegment = segments.find((segment) => segment.id === segmentId);
      if (!sourceSegment) return;

      const copySuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const nextSegmentId = `segment-${copySuffix}`;
      const duplicatedDeliveries = deliveries
        .filter((delivery) => getDeliverySegmentIds(delivery).includes(segmentId))
        .map((delivery, index) => ({
          ...JSON.parse(JSON.stringify(delivery)) as DeliveryItem,
          id: `delivery-${copySuffix}-${index}`,
          segmentId: nextSegmentId,
          segmentIds: [nextSegmentId],
        }));

      onUpdate({
        ...funnel,
        segments: [
          ...segments,
          {
            ...sourceSegment,
            id: nextSegmentId,
            name: `${sourceSegment.name}のコピー`,
            isDefault: false,
          },
        ],
        deliveries: [...deliveries, ...duplicatedDeliveries],
        updatedAt: new Date().toISOString(),
      });
      setActiveSegmentId(nextSegmentId);
      setSegmentContextMenu(null);
    }, [deliveries, funnel, onUpdate, segments]);

    const deleteSegment = useCallback((segmentId: string) => {
      const targetSegment = segments.find((segment) => segment.id === segmentId);
      if (!targetSegment || targetSegment.isDefault) return;

      setSegmentContextMenu(null);
      if (!window.confirm(`「${targetSegment.name}」を削除しますか？\nこのセグメントにだけ紐づく配信内容も削除されます。`)) return;

      const nextDeliveries = deliveries.flatMap((delivery) => {
        const deliverySegmentIds = getDeliverySegmentIds(delivery);
        if (!deliverySegmentIds.includes(segmentId)) return [delivery];

        const nextSegmentIds = deliverySegmentIds.filter((id) => id !== segmentId);
        if (nextSegmentIds.length === 0) return [];
        return [{ ...delivery, segmentId: nextSegmentIds[0], segmentIds: nextSegmentIds }];
      });
      const keptDeliveryIds = new Set(nextDeliveries.map((delivery) => delivery.id));
      const nextSegments = segments.filter((segment) => segment.id !== segmentId);
      const deletedIndex = segments.findIndex((segment) => segment.id === segmentId);

      onUpdate({
        ...funnel,
        segments: nextSegments,
        deliveries: nextDeliveries,
        connections: connections.filter((connection) =>
          keptDeliveryIds.has(connection.fromDeliveryId) && keptDeliveryIds.has(connection.toDeliveryId)
        ),
        transitions: (funnel.transitions || []).filter((transition) =>
          transition.fromSegmentId !== segmentId && transition.toSegmentId !== segmentId
        ),
        updatedAt: new Date().toISOString(),
      });
      setActiveSegmentId(nextSegments[Math.min(deletedIndex, nextSegments.length - 1)]?.id || '');
    }, [connections, deliveries, funnel, onUpdate, segments]);

    const updateDeliveryTiming = useCallback((deliveryId: string, scheduleLabel: string) => {
      const nextDeliveries = deliveries.map((delivery) =>
        delivery.id === deliveryId ? { ...delivery, scheduleLabel } : delivery
      );
      commitUpdate(nextDeliveries);
    }, [commitUpdate, deliveries]);

    const deleteDelivery = useCallback((deliveryId: string) => {
      const nextDeliveries = deliveries.filter((delivery) => delivery.id !== deliveryId);
      const nextConnections = connections.filter(
        (connection) => connection.fromDeliveryId !== deliveryId && connection.toDeliveryId !== deliveryId
      );
      commitUpdate(nextDeliveries, nextConnections);
      setEditingDeliveryId(null);
      setIsAddingNew(false);
    }, [commitUpdate, connections, deliveries]);

    const handleModalSave = useCallback((saved: DeliveryItem) => {
      const existing = deliveries.find((delivery) => delivery.id === saved.id);
      if (existing) {
        const merged = { ...saved, images: existing.images || saved.images };
        commitUpdate(deliveries.map((delivery) => delivery.id === merged.id ? merged : delivery));
      } else {
        commitUpdate([...deliveries, saved]);
      }
      setEditingDeliveryId(null);
      setIsAddingNew(false);
    }, [commitUpdate, deliveries]);

    const editingDelivery = editingDeliveryId
      ? deliveries.find((delivery) => delivery.id === editingDeliveryId) || null
      : null;

    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f8f9fc]">
        <div className="shrink-0 border-b border-slate-200 bg-white px-5">
          <div className="flex items-stretch gap-3">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="配信セグメント">
              {segments.map((segment) => {
                const isActive = segment.id === activeSegmentId;
                const deliveryCount = deliveries.filter((delivery) => getDeliverySegmentIds(delivery).includes(segment.id)).length;

                if (renamingSegmentId === segment.id) {
                  return (
                    <div
                      key={segment.id}
                      role="tab"
                      aria-selected={isActive}
                      className="flex shrink-0 items-center gap-2 border-b-2 border-[#6467f2] px-3 py-1"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                      <input
                        autoFocus
                        value={segmentNameDraft}
                        onChange={(event) => setSegmentNameDraft(event.currentTarget.value)}
                        onBlur={() => saveSegmentName(segment.id, segmentNameDraft)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            setSegmentNameDraft(segment.name);
                            setRenamingSegmentId(null);
                          }
                        }}
                        aria-label="セグメント名"
                        className="w-36 rounded border border-[#6467f2]/40 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none ring-2 ring-[#6467f2]/10"
                      />
                    </div>
                  );
                }

                return (
                  <button
                    key={segment.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    draggable={allowStructureEditing}
                    onDragStart={(event) => {
                      setDraggingSegmentId(segment.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', segment.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData('text/plain') || draggingSegmentId;
                      if (sourceId) moveSegment(sourceId, segment.id);
                      setDraggingSegmentId(null);
                    }}
                    onDragEnd={() => setDraggingSegmentId(null)}
                    onClick={() => setActiveSegmentId(segment.id)}
                    onContextMenu={allowStructureEditing ? (event) => {
                      event.preventDefault();
                      setActiveSegmentId(segment.id);
                      setSegmentContextMenu({
                        x: Math.min(event.clientX, window.innerWidth - 180),
                        y: Math.min(event.clientY, window.innerHeight - 100),
                        segmentId: segment.id,
                      });
                    } : undefined}
                    className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[11px] font-bold transition ${allowStructureEditing ? 'cursor-grab active:cursor-grabbing' : ''} ${
                      isActive
                        ? 'border-[#6467f2] text-[#6467f2]'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    } ${draggingSegmentId === segment.id ? 'opacity-40' : ''}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.name}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-[#6467f2]/10' : 'bg-slate-100'}`}>
                      {segment.contentMode === 'page' ? getSegmentPreviewUrls(segment).length : deliveryCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {allowStructureEditing && showStructureControls ? <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => addSegment('delivery')}
                className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-[#6467f2]/50 hover:text-[#6467f2]"
              >
                <span className="material-symbols-outlined text-base">add</span>
                セグメントを追加
              </button>
              {allowPageEditing ? (
                <button
                  type="button"
                  onClick={() => addSegment('page')}
                  className="flex items-center gap-1 rounded-md bg-[#6467f2] px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#5558df]"
                >
                  <span className="material-symbols-outlined text-base">language</span>
                  ページを追加
                </button>
              ) : null}
            </div> : null}
          </div>

        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {segments.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              セグメントを追加すると、ここに配信内容が表示されます
            </div>
          ) : activeSegment?.contentMode === 'page' ? (
            <div className="flex h-full min-h-[640px] items-stretch gap-4 overflow-x-auto bg-slate-100 p-4">
              {previewUrlDrafts.map((draftUrl, index) => {
                const savedUrl = getSegmentPreviewUrls(activeSegment)[index] || '';
                const savedName = getSegmentPreviewNames(activeSegment, previewUrlDrafts.length)[index];
                const previewSrc = getPagePreviewSrc(savedUrl);

                return (
                  <section
                    key={`${activeSegment.id}-${index}`}
                    className="flex h-full min-h-[760px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    style={{ flexBasis: 'calc((100% - 1rem) / 2)', minWidth: 520, maxWidth: 760 }}
                  >
                    <div className="shrink-0 border-b border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <input
                          type="text"
                          value={previewNameDrafts[index] || ''}
                          onChange={(event) => {
                            const nextNames = [...previewNameDrafts];
                            nextNames[index] = event.currentTarget.value;
                            setPreviewNameDrafts(nextNames);
                          }}
                          onBlur={(event) => {
                            const nextName = event.currentTarget.value.trim() || `ページ${index + 1}`;
                            if (nextName === savedName) return;
                            const nextNames = getSegmentPreviewNames(activeSegment, previewUrlDrafts.length);
                            nextNames[index] = nextName;
                            updateActivePageUrls(getSegmentPreviewUrls(activeSegment), nextNames);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          aria-label={`ページ${index + 1}の名前`}
                          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-200 focus:border-[#6467f2] focus:ring-1 focus:ring-[#6467f2]/20"
                        />
                        {previewUrlDrafts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextUrls = getSegmentPreviewUrls(activeSegment).filter((_, urlIndex) => urlIndex !== index);
                              const nextNames = getSegmentPreviewNames(activeSegment, previewUrlDrafts.length).filter((_, nameIndex) => nameIndex !== index);
                              updateActivePageUrls(nextUrls, nextNames);
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold text-slate-400 transition hover:text-red-500"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                            削除
                          </button>
                        )}
                      </div>
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const nextUrl = draftUrl.trim();
                          if (nextUrl && !getPagePreviewSrc(nextUrl)) return;
                          const nextUrls = [...getSegmentPreviewUrls(activeSegment)];
                          nextUrls[index] = nextUrl;
                          updateActivePageUrls(nextUrls);
                        }}
                      >
                        <input
                          type="url"
                          value={draftUrl}
                          onChange={(event) => {
                            const nextDrafts = [...previewUrlDrafts];
                            nextDrafts[index] = event.currentTarget.value;
                            setPreviewUrlDrafts(nextDrafts);
                          }}
                          placeholder="表示したいページのURLを入力"
                          aria-label={`ページ${index + 1}のプレビューURL`}
                          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#6467f2] focus:ring-1 focus:ring-[#6467f2]/20"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-md bg-[#6467f2] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#5558df]"
                        >
                          表示
                        </button>
                        {previewSrc && (
                          <a
                            href={savedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[11px] font-bold text-[#6467f2] hover:underline"
                          >
                            別タブ
                          </a>
                        )}
                      </form>
                    </div>

                    {previewSrc ? (
                      <iframe
                        key={savedUrl}
                        src={previewSrc}
                        title={`${activeSegment.name} ${savedName}のURLプレビュー`}
                        sandbox="allow-scripts"
                        referrerPolicy="no-referrer"
                        className="min-h-[680px] w-full flex-1 border-0 bg-white"
                      />
                    ) : (
                      <div className="flex min-h-[680px] flex-1 items-center justify-center bg-slate-50 px-6 text-center">
                        <div>
                          <span className="material-symbols-outlined mb-2 text-4xl text-slate-300">smartphone</span>
                          <p className="text-sm font-bold text-slate-600">URLを入れて「表示」を押してください</p>
                          <p className="mt-1 text-xs text-slate-400">スマホ向けページを横に並べて比較できます</p>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}

              <button
                type="button"
                onClick={() => updateActivePageUrls([...getSegmentPreviewUrls(activeSegment), ''])}
                className="flex min-h-[760px] w-64 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/70 text-sm font-bold text-slate-400 transition hover:border-[#6467f2]/50 hover:text-[#6467f2]"
              >
                <span className="material-symbols-outlined text-4xl">add_circle</span>
                このタブにページを追加
              </button>
            </div>
          ) : (
            <table className="h-full min-w-max border-separate border-spacing-0 text-left">
              <tbody>
                <tr className="h-[52px]">
                  <th className="sticky left-0 z-20 h-[52px] w-28 min-w-28 border-b border-r border-slate-300 bg-[#fff4cf] px-3 py-1 align-middle text-center text-xs font-bold text-slate-700">
                    配信日時
                  </th>
                  {segmentDeliveries.map((delivery, index) => (
                    <td key={delivery.id} className="w-[320px] min-w-[320px] border-b border-r border-slate-300 bg-slate-50 px-3 py-1 align-middle">
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-[11px] font-bold text-slate-500">{index + 1}通目</span>
                        <input
                          key={`${delivery.id}-${getDeliveryTiming(delivery)}`}
                          type="text"
                          aria-label={`${delivery.title || `${index + 1}通目`}の配信日時`}
                          defaultValue={getDeliveryTiming(delivery)}
                          onBlur={(event) => {
                            const nextTiming = event.currentTarget.value.trim();
                            if (nextTiming !== getDeliveryTiming(delivery)) {
                              updateDeliveryTiming(delivery.id, nextTiming);
                            }
                          }}
                          placeholder="例: 登録直後、登録後5分、3日目 20:00"
                          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-[#6467f2] focus:outline-none focus:ring-1 focus:ring-[#6467f2]/20"
                        />
                      </div>
                    </td>
                  ))}
                  <td
                    rowSpan={2}
                    className="relative w-[180px] min-w-[180px] border-b border-r border-slate-300 bg-white align-middle"
                  >
                    <button
                      type="button"
                      onClick={addDeliveryNode}
                      className="absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white text-xs font-bold text-slate-400 transition hover:border-[#6467f2]/50 hover:text-[#6467f2]"
                    >
                      <span className="text-3xl font-light leading-none">＋</span>
                      配信を追加
                    </button>
                  </td>
                </tr>
                <tr className="h-full">
                  <th className="sticky left-0 z-10 w-28 min-w-28 border-b border-r border-slate-300 bg-[#fff4cf] px-3 py-4 align-top text-center text-xs font-bold text-slate-700">
                    配信内容
                  </th>
                  {segmentDeliveries.map((delivery) => (
                    <td
                      key={delivery.id}
                      onDoubleClick={() => setEditingDeliveryId(delivery.id)}
                      title="ダブルクリックで編集"
                      className="relative w-[320px] min-w-[320px] cursor-default border-b border-r border-slate-300 bg-white p-3 align-top"
                    >
                      {getVisibleMessages(delivery).length ? (
                        <>
                          <div
                            aria-hidden="true"
                            className="absolute inset-x-3 bottom-0 top-3 rounded-t-lg bg-[#8AABCC]"
                          />
                          <div className="relative w-full overflow-hidden text-left">
                            <LineMessageRenderer
                              messages={getVisibleMessages(delivery)}
                              notificationText={delivery.notificationText}
                              maxWidth={292}
                            />
                          </div>
                        </>
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {allowStructureEditing && segmentContextMenu && (
          <div
            role="menu"
            aria-label="セグメント操作"
            onClick={(event) => event.stopPropagation()}
            className="fixed z-[100] min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ left: segmentContextMenu.x, top: segmentContextMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => startSegmentRename(segmentContextMenu.segmentId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              名前を編集
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => duplicateSegment(segmentContextMenu.segmentId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>
              複製
            </button>
            {!segments.find((segment) => segment.id === segmentContextMenu.segmentId)?.isDefault && (
              <button
                type="button"
                role="menuitem"
                onClick={() => deleteSegment(segmentContextMenu.segmentId)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-red-600 hover:bg-red-50"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                削除
              </button>
            )}
          </div>
        )}

        {(isAddingNew || editingDelivery) && (
          <DeliveryModal
            date={editingDelivery?.date || editingDelivery?.startDate || today}
            initialSegmentIds={activeSegmentId ? [activeSegmentId] : []}
            delivery={editingDelivery}
            onSave={handleModalSave}
            onDelete={editingDelivery ? () => deleteDelivery(editingDelivery.id) : undefined}
            onClose={() => {
              setEditingDeliveryId(null);
              setIsAddingNew(false);
            }}
          />
        )}
      </div>
    );
  }
);

DeliveryGrid.displayName = 'DeliveryGrid';
