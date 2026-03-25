import { useEffect, useMemo, useState } from 'react';
import ClipCard from '../components/ClipCard';
import ClipEditorModal from '../components/ClipEditorModal';
import { listClips } from '../lib/api';

const PLATFORM_OPTIONS = ['all', 'twitch', 'kick', 'upload'];

export default function Library({ pushToast }) {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState('');
  const [sort, setSort] = useState('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingClip, setEditingClip] = useState(null);

  const loadClips = async () => {
    try {
      setLoading(true);
      const result = await listClips({
        platform: platformFilter === 'all' ? '' : platformFilter,
        source: sourceFilter,
        search,
        tags,
        sort,
      });
      setClips(result);
    } catch (error) {
      pushToast({ type: 'error', message: error?.response?.data?.error || 'Failed to load clip library' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFilter, sourceFilter, search, tags, sort]);

  const visibleClips = useMemo(() => {
    return clips.filter((clip) => {
      if (dateFrom && new Date(clip.createdAt) < new Date(`${dateFrom}T00:00:00`)) {
        return false;
      }

      if (dateTo && new Date(clip.createdAt) > new Date(`${dateTo}T23:59:59`)) {
        return false;
      }

      return true;
    });
  }, [clips, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => setPlatformFilter(platform)}
              className={`rounded-full border px-3 py-1 text-xs uppercase transition ${
                platformFilter === platform
                  ? 'border-accent-purple bg-accent-purple/20 text-text-primary'
                  : 'border-border text-text-secondary hover:border-accent-purple/40'
              }`}
            >
              {platform}
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clips"
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary lg:col-span-2"
          />

          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Tag filter"
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          />

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="voice">Voice</option>
            <option value="audio">Audio</option>
            <option value="motion">Motion</option>
            <option value="chat">Chat</option>
            <option value="upload">Auto-Upload</option>
          </select>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="duration">Duration</option>
            <option value="detection">Detection type</option>
          </select>

          <div className="grid grid-cols-2 gap-2 lg:col-span-6">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary"
            />
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-text-secondary">Loading clips...</p> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleClips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} onOpen={setEditingClip} />
        ))}
      </div>

      <ClipEditorModal
        clip={editingClip}
        isOpen={Boolean(editingClip)}
        onClose={() => setEditingClip(null)}
        onSaved={() => loadClips()}
        onToast={pushToast}
      />
    </div>
  );
}
