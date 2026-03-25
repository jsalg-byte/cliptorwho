import { detectionSourceLabel } from '../lib/utils';

const SOURCE_STYLES = {
  voice: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  manual: 'bg-slate-500/20 text-slate-200 border-slate-400/40',
  audio: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  motion: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  chat: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  upload: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
};

const SOURCE_ICON = {
  voice: '🎙️',
  manual: '🎬',
  audio: '🔊',
  motion: '👁️',
  chat: '💬',
  upload: '📦',
};

export default function DetectionBadge({ source }) {
  const label = detectionSourceLabel(source);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
        SOURCE_STYLES[source] || 'border-border text-text-secondary'
      }`}
    >
      <span>{SOURCE_ICON[source] || '•'}</span>
      <span>{label}</span>
    </span>
  );
}
