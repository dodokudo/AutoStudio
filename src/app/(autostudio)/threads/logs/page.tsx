import { PostingLogsContainer } from './_components/posting-logs-container';

export default function ThreadsLogsPage() {
  return (
    <div className="container max-w-7xl space-y-8 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">投稿ログ</h1>
        <p className="text-muted-foreground">
          Threads投稿の履歴と結果を確認できます
        </p>
      </div>

      <PostingLogsContainer />
    </div>
  );
}