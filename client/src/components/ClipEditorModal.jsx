import { useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl, trimClip as trimClipApi, updateClip } from '../lib/api';
import { formatDuration, uniqueTags } from '../lib/utils';
import TagPill from './TagPill';

export default function ClipEditorModal({ clip, isOpen, onClose, onSaved, onToast }) {
  const videoRef = useRef(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clip) {
      return;
    }

    setTrimStart(0);
    setTrimEnd(Number(clip.duration || 0));
    setTitle(clip.title || '');
    setTagsInput((clip.tags || []).join(', '));
  }, [clip]);

  const tagPreview = useMemo(() => uniqueTags(tagsInput.split(',')), [tagsInput]);
  const trimmedDuration = Math.max(0, Number(trimEnd) - Number(trimStart));
  const estimatedSizeMb = (trimmedDuration * 0.25).toFixed(2);

  if (!isOpen || !clip) {
    return null;
  }

  const setHandleAtCurrentTime = (target) => {
    const current = Number(videoRef.current?.currentTime || 0);

    if (target === 'start') {
      setTrimStart(Math.min(current, trimEnd - 0.1));
      return;
    }

    setTrimEnd(Math.max(current, trimStart + 0.1));
  };

  const handleSaveTrim = async () => {
    try {
      setSaving(true);

      const nextTags = uniqueTags(tagsInput.split(','));
      await updateClip(clip.id, {
        title,
        tags: nextTags,
      });

      const updated = await trimClipApi(clip.id, {
        start: trimStart,
        end: trimEnd,
      });

      onSaved?.({
        ...updated,
        title,
        tags: nextTags,
      });
      onToast?.({ type: 'success', message: 'Clip trim saved.' });
      onClose?.();
    } catch (error) {
      onToast?.({
        type: 'error',
        message: error?.response?.data?.error || error.message || 'Failed to save clip trim',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyShare = async () => {
    const shareUrl = `${window.location.origin}/share/${clip.shareToken}`;
    await navigator.clipboard.writeText(shareUrl);
    onToast?.({ type: 'success', message: 'Share link copied.' });
  };

  const fileUrl = buildApiUrl(clip.fileUrl || `/api/clips/${clip.id}/file`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-border bg-bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-text-primary">Clip Editor</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1 text-sm text-text-secondary transition hover:border-slate-400"
          >
            Close
          </button>
        </div>

        <video ref={videoRef} src={fileUrl} controls className="mb-4 aspect-video w-full rounded-xl bg-black" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border bg-bg-elevated p-3">
            <p className="text-sm font-semibold text-text-primary">Trim Range</p>

            <label className="block text-xs text-text-secondary">Start: {formatDuration(trimStart)}</label>
            <input
              type="range"
              min={0}
              max={clip.duration}
              step={0.1}
              value={trimStart}
              onChange={(event) => setTrimStart(Math.min(Number(event.target.value), trimEnd - 0.1))}
              className="w-full"
            />

            <label className="block text-xs text-text-secondary">End: {formatDuration(trimEnd)}</label>
            <input
              type="range"
              min={0}
              max={clip.duration}
              step={0.1}
              value={trimEnd}
              onChange={(event) => setTrimEnd(Math.max(Number(event.target.value), trimStart + 0.1))}
              className="w-full"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHandleAtCurrentTime('start')}
                className="rounded-md border border-border px-3 py-1 text-xs text-text-secondary transition hover:border-accent-purple"
              >
                Set In
              </button>
              <button
                type="button"
                onClick={() => setHandleAtCurrentTime('end')}
                className="rounded-md border border-border px-3 py-1 text-xs text-text-secondary transition hover:border-accent-purple"
              >
                Set Out
              </button>
            </div>

            <div className="rounded-md border border-border bg-bg-card p-2 text-xs text-text-secondary">
              <p>Duration: {formatDuration(trimmedDuration)}</p>
              <p>Estimated size: ~{estimatedSizeMb} MB</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-bg-elevated p-3">
            <label className="block text-xs text-text-secondary">Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
            />

            <label className="block text-xs text-text-secondary">Tags (comma-separated)</label>
            <input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="w-full rounded-md border border-border bg-bg-card px-3 py-2 text-sm text-text-primary"
            />

            <div className="flex flex-wrap gap-1">
              {tagPreview.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveTrim}
                className="rounded-md bg-accent-purple px-3 py-1 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Trim'}
              </button>

              <a
                href={fileUrl}
                download
                className="rounded-md border border-border px-3 py-1 text-sm text-text-secondary transition hover:border-accent-purple"
              >
                Download
              </a>

              <button
                type="button"
                onClick={handleCopyShare}
                className="rounded-md border border-border px-3 py-1 text-sm text-text-secondary transition hover:border-accent-purple"
              >
                Copy Share Link
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
