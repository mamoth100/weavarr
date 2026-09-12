import Sidebar from '@/components/Sidebar';

/**
 * Left-rail layout used by every page, and the single owner of the page
 * header - the sidebar already carries the Weavarr wordmark permanently, so
 * repeating it in each page's own header was pure duplication. Pass `title`
 * for the page's heading (omit for pages like the detail views that show
 * their own title in the content itself) and `headerActions` for anything
 * that belongs on the right. The subtitle is the one-line explanation that
 * used to be jammed into the title itself after a dash; on a phone those
 * titles wrapped to three lines and pushed the content off screen.
 */
export default function AppShell({
  title,
  subtitle,
  headerActions,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white lg:flex">
      <Sidebar mobileTitle={typeof title === 'string' ? title : undefined} />
      <div className="flex-1 min-w-0">
        {(title || headerActions) && (
          <header className="border-b border-zinc-800 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              {title && (
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
                  {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
                </div>
              )}
              {headerActions}
            </div>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
