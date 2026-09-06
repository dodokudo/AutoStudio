import type { YoutubeBigQueryContext } from './bigquery';

export type YoutubeCompetitorCategory = 'ai' | 'threads';

export interface YoutubeCompetitor {
  channelId: string;
  channelTitle: string;
  category: YoutubeCompetitorCategory;
  active: boolean;
  note?: string;
  addedAt?: string;
  updatedAt?: string;
}

type YoutubeCompetitorInput = {
  channelId: string;
  channelTitle: string;
  category: YoutubeCompetitorCategory;
  note?: string;
  active?: boolean;
};

export async function listActiveYoutubeCompetitors(
  context: YoutubeBigQueryContext,
): Promise<YoutubeCompetitor[]> {
  const { client, projectId, datasetId } = context;
  const [rows] = await client.query({
    query: `
      SELECT
        channel_id,
        channel_title,
        category,
        active,
        note,
        added_at,
        updated_at
      FROM \`${projectId}.${datasetId}.youtube_competitors\`
      WHERE active = TRUE
      ORDER BY category, channel_title
    `,
  });

  return (rows as Array<{
    channel_id: string;
    channel_title: string | null;
    category: string;
    active: boolean;
    note: string | null;
    added_at: { value?: string } | string | null;
    updated_at: { value?: string } | string | null;
  }>).map((row) => ({
    channelId: row.channel_id,
    channelTitle: row.channel_title ?? row.channel_id,
    category: row.category === 'threads' ? 'threads' : 'ai',
    active: row.active,
    note: row.note ?? undefined,
    addedAt: typeof row.added_at === 'string' ? row.added_at : row.added_at?.value,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at?.value,
  }));
}

export async function upsertYoutubeCompetitor(
  context: YoutubeBigQueryContext,
  competitor: YoutubeCompetitorInput,
): Promise<void> {
  await upsertYoutubeCompetitors(context, [competitor]);
}

export async function upsertYoutubeCompetitors(
  context: YoutubeBigQueryContext,
  competitors: YoutubeCompetitorInput[],
): Promise<void> {
  if (competitors.length === 0) return;
  const { client, projectId, datasetId } = context;
  const params: Record<string, string | boolean | null> = {};
  const sourceRows = competitors.map((competitor, index) => {
    params[`channel_id_${index}`] = competitor.channelId;
    params[`channel_title_${index}`] = competitor.channelTitle;
    params[`category_${index}`] = competitor.category;
    params[`active_${index}`] = competitor.active ?? true;
    params[`note_${index}`] = competitor.note ?? null;
    return `SELECT
      @channel_id_${index} AS channel_id,
      @channel_title_${index} AS channel_title,
      @category_${index} AS category,
      @active_${index} AS active,
      @note_${index} AS note`;
  }).join('\nUNION ALL\n');

  await client.query({
    query: `
      MERGE \`${projectId}.${datasetId}.youtube_competitors\` target
      USING (
        SELECT source.*, CURRENT_TIMESTAMP() AS now
        FROM (
          ${sourceRows}
        ) source
      ) source
      ON target.channel_id = source.channel_id
      WHEN MATCHED THEN UPDATE SET
        channel_title = source.channel_title,
        category = source.category,
        active = source.active,
        note = source.note,
        updated_at = source.now
      WHEN NOT MATCHED THEN INSERT (
        channel_id,
        channel_title,
        category,
        active,
        note,
        added_at,
        updated_at
      ) VALUES (
        source.channel_id,
        source.channel_title,
        source.category,
        source.active,
        source.note,
        source.now,
        source.now
      )
    `,
    params,
    types: Object.fromEntries(competitors.map((_, index) => [`note_${index}`, 'STRING'])),
  });
}

export async function deactivateYoutubeCompetitor(
  context: YoutubeBigQueryContext,
  channelId: string,
): Promise<void> {
  const { client, projectId, datasetId } = context;
  await client.query({
    query: `
      UPDATE \`${projectId}.${datasetId}.youtube_competitors\`
      SET active = FALSE, updated_at = CURRENT_TIMESTAMP()
      WHERE channel_id = @channel_id
    `,
    params: { channel_id: channelId },
  });
}
