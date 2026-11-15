import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
    </div>
  );
}
