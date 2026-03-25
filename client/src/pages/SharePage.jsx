import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildApiUrl, getSharedClip } from '../lib/api';
import { formatDateTime, formatDuration } from '../lib/utils';

export default function SharePage() {
  const { token } = useParams();
  const [clip, setClip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClip = async () => {
      try {
        setLoading(true);
        setError('');
        const shared = await getSharedClip(token);
        setClip(shared);
      } catch (apiError) {
        setError(apiError?.response?.data?.error || apiError.message || 'Failed to load shared clip');
      } finally {
        setLoading(false);
      }
    };

    loadClip();
  }, [token]);

  if (loading) {
    return <p className="p-6 text-sm text-text-secondary">Loading shared clip...</p>;
  }

  if (error || !clip) {
    return <p className="p-6 text-sm text-accent-red">{error || 'Clip not found'}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{clip.title || 'Shared Clip'}</h1>
      <p className="text-sm text-text-secondary">
        {clip.channel} • {clip.platform} • {formatDuration(clip.duration)} • {formatDateTime(clip.createdAt)}
      </p>

      <video
        src={buildApiUrl(clip.fileUrl)}
        controls
        className="aspect-video w-full rounded-2xl border border-border bg-black"
      />

      <div className="flex flex-wrap gap-2">
        {clip.tags?.map((tag) => (
          <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
}
