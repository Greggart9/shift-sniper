"use client";

interface ResponsiveGuardProps {
  children: React.ReactNode;
}

export default function ResponsiveGuard({ children }: ResponsiveGuardProps) {
  return (
    <>
      {/* Hidden on small/medium screens, shown on large screens and above */}
      <div className="hidden lg:block">{children}</div>

      {/* Shown on small/medium screens, hidden on large screens and above */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-shift-navy text-shift-textMain">
        <div className="text-center px-4">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 mx-auto">
            <span className="text-4xl">📱</span>
          </div>

          <h1 className="text-3xl font-bold tracking-[-0.02em] text-white mb-3">
            Screen Too Small
          </h1>

          <p className="text-shift-textMuted mb-8 max-w-sm mx-auto">
            This application is optimized for larger screens. Please open on a desktop or tablet (medium screen or larger) for the best experience.
          </p>

          <div className="space-y-3 text-sm text-shift-textMuted">
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-shift-lime" />
              <span>Landscape orientation recommended</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-shift-lime" />
              <span>Desktop or tablet required</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
