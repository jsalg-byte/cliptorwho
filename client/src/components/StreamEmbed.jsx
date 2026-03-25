import { useEffect, useMemo, useState } from 'react';

export default function StreamEmbed({
  platform,
  channel,
  embedUrl,
  playbackUrl,
  videoRef,
  creatorOffline = false,
  onMonitorAnother = null,
}) {
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const fallbackEmbed = useMemo(() => {
    if (embedUrl) {
      return embedUrl;
    }

    if (!channel || !platform) {
      return '';
    }

    if (platform === 'twitch') {
      return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&muted=true`;
    }

    return `https://player.kick.com/${channel}`;
  }, [channel, embedUrl, platform]);

  useEffect(() => {
    setPlaybackFailed(false);
  }, [platform, channel, playbackUrl]);

  if (!channel) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card px-4 text-center text-text-secondary">
        {creatorOffline ? (
          <p className="text-sm">
            You are offline right now.{' '}
            <button
              type="button"
              onClick={onMonitorAnother}
              className="font-semibold text-accent-cyan underline underline-offset-2 transition hover:text-cyan-400"
            >
              Monitor another creators stream?
            </button>
          </p>
        ) : (
          'Monitor another creator to load stream.'
        )}
      </div>
    );
  }

  const shouldUseVideo = Boolean(playbackUrl && !playbackFailed);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-card">
      {shouldUseVideo ? (
        <>
          <video
            ref={videoRef}
            src={playbackUrl}
            controls
            muted
            autoPlay
            crossOrigin="anonymous"
            onError={() => setPlaybackFailed(true)}
            className="h-[420px] w-full bg-black object-cover"
          />
          {playbackFailed ? null : (
            <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
              If this stream fails to load, Cliptor Who will fall back to embed mode automatically.
            </p>
          )}
        </>
      ) : (
        <iframe
          title="Stream Embed"
          src={fallbackEmbed}
          allow="autoplay; fullscreen"
          className="h-[420px] w-full border-0 bg-black"
        />
      )}
    </div>
  );
}
