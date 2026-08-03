'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeliveryGrid, type DeliveryCanvasRef } from './funnel-delivery/DeliveryGrid';
import type { Funnel } from './funnel-delivery/types';

interface FunnelListItem {
  id: string;
  name: string;
}

function normalizeFunnel(value: Funnel): Funnel {
  return {
    ...value,
    segments: value.segments || [],
    deliveries: (value.deliveries || []).map((delivery) => ({
      ...delivery,
      segmentIds: delivery.segmentIds?.length ? delivery.segmentIds : [delivery.segmentId],
    })),
    connections: value.connections || [],
    transitions: value.transitions || [],
    canvasNodes: value.canvasNodes || [],
    canvasEdges: value.canvasEdges || [],
  };
}

export function LineDeliveryDraft() {
  const deliveryGridRef = useRef<DeliveryCanvasRef>(null);
  const [projects, setProjects] = useState<FunnelListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/launch/funnels/${encodeURIComponent(projectId)}?editor=1`, { cache: 'no-store' });
      if (!response.ok) throw new Error('プロジェクトを読み込めませんでした');
      const data = await response.json() as { funnel: Funnel };
      setFunnel(normalizeFunnel(data.funnel));
    } catch (loadError) {
      setFunnel(null);
      setError(loadError instanceof Error ? loadError.message : 'プロジェクトを読み込めませんでした');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/launch/funnels/available', { cache: 'no-store' });
        if (!response.ok) throw new Error('プロジェクト一覧を読み込めませんでした');
        const data = await response.json() as { funnels: FunnelListItem[] };
        if (!isMounted) return;
        const nextProjects = data.funnels || [];
        setProjects(nextProjects);
        const preferred = nextProjects.find((project) => project.name.includes('8月')) || nextProjects[0];
        if (preferred) {
          setSelectedProjectId(preferred.id);
          await loadProject(preferred.id);
        } else {
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'プロジェクト一覧を読み込めませんでした');
        setIsLoading(false);
      }
    };

    void loadProjects();
    return () => {
      isMounted = false;
    };
  }, [loadProject]);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    void loadProject(projectId);
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/launch/funnels/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json() as { funnel?: Funnel; error?: string };
      if (!response.ok || !data.funnel) {
        throw new Error(data.error || 'プロジェクトを作成できませんでした');
      }

      const created = normalizeFunnel(data.funnel);
      setProjects((current) => [{ id: created.id, name: created.name }, ...current]);
      setSelectedProjectId(created.id);
      setFunnel(created);
      setNewProjectName('');
      setIsCreateOpen(false);
      setIsLoading(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'プロジェクトを作成できませんでした');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!funnel) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/launch/funnels/${encodeURIComponent(funnel.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(funnel),
      });
      if (!response.ok) throw new Error('保存できませんでした');
      const saved = await response.json() as { funnel: Funnel };
      setFunnel(normalizeFunnel(saved.funnel));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存できませんでした');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="section-stack">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] bg-white px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-[color:var(--color-text-primary)]">
              <span className="shrink-0">プロジェクト</span>
              <select
                value={selectedProjectId}
                onChange={(event) => handleProjectChange(event.target.value)}
                className="min-w-56 rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]"
                aria-label="LINE配信プロジェクト"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
              ＋ 新規プロジェクト
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => deliveryGridRef.current?.addSegment()}
              disabled={!funnel || isLoading}
            >
              ＋ セグメントを追加
            </Button>
            <Button onClick={handleSave} disabled={!funnel || isSaving}>
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-[620px] items-center justify-center text-sm text-[color:var(--color-text-muted)]">読み込み中...</div>
        ) : null}

        {!isLoading && funnel ? (
          <div className="h-[calc(100dvh-182px)] min-h-[680px] overflow-hidden">
            <DeliveryGrid
              ref={deliveryGridRef}
              funnel={funnel}
              onUpdate={setFunnel}
              allowStructureEditing
              allowPageEditing={false}
              showStructureControls={false}
            />
          </div>
        ) : null}

        {!isLoading && !funnel && !error ? (
          <div className="flex min-h-[620px] items-center justify-center text-sm text-[color:var(--color-text-muted)]">プロジェクトがありません</div>
        ) : null}
      </Card>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="new-line-project-title">
          <form onSubmit={handleCreateProject} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="new-line-project-title" className="text-lg font-semibold text-[color:var(--color-text-primary)]">新規LINE配信プロジェクト</h2>
            <label className="mt-5 block text-sm font-medium text-[color:var(--color-text-primary)]">
              プロジェクト名
              <input
                autoFocus
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="例：10月ローンチ"
                maxLength={100}
                className="mt-2 w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--color-accent)]"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
                setIsCreateOpen(false);
                setNewProjectName('');
              }} disabled={isCreating}>
                キャンセル
              </Button>
              <Button type="submit" disabled={!newProjectName.trim() || isCreating}>
                {isCreating ? '作成中...' : '作成'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
