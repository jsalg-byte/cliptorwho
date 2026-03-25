import DetectionBadge from './DetectionBadge';
import TagPill from './TagPill';
import { formatDateTime, formatDuration } from '../lib/utils';
import { buildApiUrl } from '../lib/api';

function sourceBadge(platform) {
  return platform === 'twitch'
    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
    : platform === 'kick'
      ? 'bg-green-500/20 text-green-300 border-green-500/40'
      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
}

export default function ClipCard({ clip, onOpen }) {
  const thumbSrc = clip.thumbnailUrl?.startsWith('http')
    ? clip.thumbnailUrl
    : buildApiUrl(clip.thumbnailUrl || `/api/clips/${clip.id}/thumb`);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(clip)}
      className="group overflow-hidden rounded-xl border border-border bg-bg-card text-left transition duration-200 hover:border-accent-purple"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <img src={thumbSrc} alt={clip.title || 'Clip thumbnail'} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-xs ${sourceBadge(clip.platform)}`}>
            {clip.platform}
          </span>
          <DetectionBadge source={clip.source} />
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 text-sm font-semibold text-text-primary">{clip.title || 'Untitled clip'}</p>
          <span className="text-xs text-text-secondary">{formatDuration(clip.duration)}</span>
        </div>

        <p className="text-xs text-text-secondary">
          {clip.channel || 'channel'} • {formatDateTime(clip.createdAt)}
        </p>

        <div className="flex flex-wrap gap-1">
          {clip.tags?.slice(0, 3).map((tag) => (
            <TagPill key={`${clip.id}-${tag}`} tag={tag} />
          ))}
        </div>
      </div>
    </button>
  );
}
