export default function MonthProgressBar({ progress }: { progress: number }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className="month-progress-fill h-full rounded-full progress-bar-accent transition-none" style={{ width: `${progress}%` }} />
    </div>
  );
}
