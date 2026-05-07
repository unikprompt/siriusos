export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="shimmer h-7 w-40" />
        <div className="shimmer h-4 w-60" />
      </div>

      {/* Cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="shimmer h-28 rounded-xl" />
        ))}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="shimmer lg:col-span-3 h-64 rounded-xl" />
        <div className="shimmer lg:col-span-2 h-64 rounded-xl" />
      </div>

      {/* Bottom section */}
      <div className="shimmer h-48 rounded-xl" />
    </div>
  );
}
