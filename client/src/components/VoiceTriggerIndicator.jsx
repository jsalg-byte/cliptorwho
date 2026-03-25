import { cn } from '../lib/utils';

export default function VoiceTriggerIndicator({
  listening,
  supported,
  flashTriggered,
  transcript,
  onToggle,
}) {
  const colorClass = !supported
    ? 'bg-slate-500'
    : flashTriggered
      ? 'bg-accent-green shadow-[0_0_24px_rgba(16,185,129,0.6)]'
      : listening
        ? 'bg-red-500 animate-pulseSoft'
        : 'bg-slate-600';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed bottom-5 right-5 z-50 flex flex-col items-center gap-2"
      title={supported ? 'Toggle voice listener' : 'Speech recognition unsupported'}
    >
      <span className={cn('h-12 w-12 rounded-full transition-all duration-200', colorClass)} />
      <span className="max-w-[220px] text-center text-xs text-text-secondary">
        {supported ? transcript || (listening ? 'Listening...' : 'Voice idle') : 'Voice unsupported'}
      </span>
    </button>
  );
}
