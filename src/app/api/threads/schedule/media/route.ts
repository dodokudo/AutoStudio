import { NextRequest, NextResponse } from 'next/server';
import { createSignedGCSUploadUrl, uploadBufferToGCS } from '@/lib/gcs';
import {
  getThreadsMediaExtension,
  getThreadsMediaType,
  MAX_THREADS_MEDIA_ITEMS,
} from '@/lib/threadsMedia';
import { resolveThreadsAccountKey } from '@/lib/threadsAccounts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type UploadRequestFile = {
  name?: string;
  type?: string;
  size?: number;
};

function validateFileMeta(file: UploadRequestFile) {
  const contentType = typeof file.type === 'string' ? file.type : '';
  const size = typeof file.size === 'number' ? file.size : 0;
  const type = getThreadsMediaType(contentType);
  if (!type) return { error: `${file.name || 'file'}は対応していないファイル形式です` };
  const maxBytes = type === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (size > maxBytes) return { error: `${file.name || 'file'}のサイズが大きすぎます` };
  return { contentType, size, type };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const files = Array.isArray(body?.files) ? (body.files as UploadRequestFile[]) : [];
      if (files.length === 0) {
        return NextResponse.json({ error: 'files are required' }, { status: 400 });
      }
      if (files.length > MAX_THREADS_MEDIA_ITEMS) {
        return NextResponse.json({ error: `メディアは最大${MAX_THREADS_MEDIA_ITEMS}件までです` }, { status: 400 });
      }

      const accountKey = resolveThreadsAccountKey(body?.accountKey);
      const group = typeof body?.uploadGroup === 'string' && body.uploadGroup.trim()
        ? body.uploadGroup.trim().replace(/[^a-zA-Z0-9._-]/g, '-')
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const uploadTargets = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const validation = validateFileMeta(file);
        if ('error' in validation) {
          return NextResponse.json({ error: validation.error }, { status: 400 });
        }
        const extension = getThreadsMediaExtension(validation.contentType);
        const fileName = `${String(index + 1).padStart(2, '0')}-${Date.now()}.${extension}`;
        const signed = await createSignedGCSUploadUrl(
          validation.contentType,
          fileName,
          `threads/scheduled/${accountKey}/${group}`,
        );
        if (!signed) {
          return NextResponse.json({ error: `${file.name || 'file'}のアップロードURL作成に失敗しました` }, { status: 500 });
        }
        uploadTargets.push({
          uploadUrl: signed.uploadUrl,
          url: signed.publicUrl,
          type: validation.type,
          name: file.name || fileName,
          contentType: validation.contentType,
          size: validation.size,
        });
      }

      return NextResponse.json({ uploadTargets });
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: 'files are required' }, { status: 400 });
    }
    if (files.length > MAX_THREADS_MEDIA_ITEMS) {
      return NextResponse.json({ error: `メディアは最大${MAX_THREADS_MEDIA_ITEMS}件までです` }, { status: 400 });
    }

    const rawAccountKey = formData.get('accountKey');
    const accountKey = resolveThreadsAccountKey(typeof rawAccountKey === 'string' ? rawAccountKey : undefined);
    const uploadGroup = formData.get('uploadGroup');
    const group = typeof uploadGroup === 'string' && uploadGroup.trim()
      ? uploadGroup.trim().replace(/[^a-zA-Z0-9._-]/g, '-')
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const mediaItems = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const type = getThreadsMediaType(file.type);
      if (!type) {
        return NextResponse.json({ error: `${file.name}は対応していないファイル形式です` }, { status: 400 });
      }
      const maxBytes = type === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        return NextResponse.json({ error: `${file.name}のサイズが大きすぎます` }, { status: 400 });
      }

      const extension = getThreadsMediaExtension(file.type);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `${String(index + 1).padStart(2, '0')}-${Date.now()}.${extension}`;
      const url = await uploadBufferToGCS(
        buffer,
        file.type,
        fileName,
        `threads/scheduled/${accountKey}/${group}`,
      );
      if (!url) {
        return NextResponse.json({ error: `${file.name}のアップロードに失敗しました` }, { status: 500 });
      }

      mediaItems.push({
        url,
        type,
        name: file.name,
        contentType: file.type,
        size: file.size,
      });
    }

    return NextResponse.json({ mediaItems });
  } catch (error) {
    console.error('[threads/schedule/media] POST failed', error);
    return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 });
  }
}
