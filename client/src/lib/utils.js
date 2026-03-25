export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

export function formatDateTime(isoDate) {
  if (!isoDate) {
    return '-';
  }

  return new Date(isoDate).toLocaleString();
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function uniqueTags(tags = []) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

export function scoreColor(score) {
  if (score >= 75) {
    return 'border-l-accent-green';
  }

  if (score >= 50) {
    return 'border-l-yellow-400';
  }

  return 'border-l-orange-400';
}

export function detectionSourceLabel(source) {
  const labels = {
    voice: 'Voice',
    manual: 'Manual',
    audio: 'Audio',
    motion: 'Motion',
    chat: 'Chat',
    upload: 'Auto-Upload',
  };

  return labels[source] || source;
}
