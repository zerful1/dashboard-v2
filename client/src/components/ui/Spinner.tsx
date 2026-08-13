export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center p-8">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
