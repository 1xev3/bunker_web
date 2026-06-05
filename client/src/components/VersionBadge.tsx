const buildDate = new Date(__BUILD_DATE__);
const buildLabel = isNaN(buildDate.getTime())
  ? __BUILD_DATE__
  : buildDate.toLocaleString();

export default function VersionBadge() {
  return (
    <div
      className="fixed bottom-1 right-2 z-50 select-none text-[10px] leading-none text-white/30 hover:text-white/70 transition-colors"
      title={`Сборка: ${buildLabel}`}
    >
      v{__APP_VERSION__} · {__GIT_HASH__}
    </div>
  );
}
