export default function ActivityLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="shimmer h-7 w-32" />
        <div className="shimmer h-4 w-56" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="shimmer h-9 w-28" />
        ))}
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shimmer h-16" />
        ))}
      </div>
    </div>
  );
}
