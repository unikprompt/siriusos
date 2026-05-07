export default function AgentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="shimmer h-7 w-32" />
        <div className="shimmer h-4 w-48" />
      </div>

      {/* Health summary */}
      <div className="flex items-center gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="shimmer h-5 w-20" />
        ))}
      </div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
