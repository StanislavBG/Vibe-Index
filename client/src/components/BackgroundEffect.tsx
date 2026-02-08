export function BackgroundEffect() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-0 right-0 h-[600px] bg-gradient-to-b from-neutral-50 to-transparent dark:from-neutral-900/50 dark:to-transparent" />
    </div>
  );
}
