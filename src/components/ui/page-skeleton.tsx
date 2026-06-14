export type PageSkeletonProps = {
  sections?: number;
  showFilters?: boolean;
};

const baseLineClass = 'rounded-md bg-[color:var(--color-surface-muted)]';

export function PageSkeleton({ sections = 3, showFilters = true }: PageSkeletonProps) {
  return (
    <div className="section-stack w-full min-w-0" aria-busy="true" aria-live="polite" role="status">
      {showFilters && (
        <div className="ui-card animate-pulse">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_minmax(120px,160px)]">
            <div className={`h-10 w-full ${baseLineClass}`} />
            <div className={`h-10 w-full ${baseLineClass}`} />
            <div className={`h-10 w-full ${baseLineClass}`} />
          </div>
        </div>
      )}
      {Array.from({ length: sections }).map((_, index) => (
        <div key={index} className="ui-card animate-pulse">
          <div className="flex flex-col gap-4">
            <div className={`h-6 w-2/3 max-w-md ${baseLineClass}`} />
            <div className="grid gap-3 xl:grid-cols-2">
              <div className={`h-24 ${baseLineClass}`} />
              <div className={`h-24 ${baseLineClass}`} />
            </div>
            <div className={`h-4 w-full ${baseLineClass}`} />
            <div className={`h-4 w-3/4 ${baseLineClass}`} />
            <div className={`h-4 w-2/3 ${baseLineClass}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
