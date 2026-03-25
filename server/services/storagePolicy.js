const fs = require('fs');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStorageConfig() {
  const maxStorageBytesFromEnv = toNumber(process.env.MAX_STORAGE_BYTES, 0);
  const maxStorageGb = toNumber(process.env.MAX_STORAGE_GB, 0);
  const maxStorageBytes = maxStorageBytesFromEnv > 0
    ? maxStorageBytesFromEnv
    : maxStorageGb > 0
      ? Math.floor(maxStorageGb * 1024 * 1024 * 1024)
      : 0;

  const retentionDays = Math.max(0, Math.floor(toNumber(process.env.CLIP_RETENTION_DAYS, 0)));
  const estimatedBytesPerSecond = Math.max(1, Math.floor(toNumber(process.env.ESTIMATED_BYTES_PER_SECOND, 750000)));

  return {
    maxStorageBytes,
    retentionDays,
    estimatedBytesPerSecond,
  };
}

function estimateClipBytes(durationSeconds) {
  const { estimatedBytesPerSecond } = getStorageConfig();
  return Math.max(1, Math.floor(Number(durationSeconds || 0) * estimatedBytesPerSecond));
}

function getStorageBudgetState(queries, additionalBytes = 0) {
  const { maxStorageBytes } = getStorageConfig();
  const currentBytes = queries.getTotalClipStorageBytes();
  const projectedBytes = currentBytes + Math.max(0, Number(additionalBytes || 0));

  return {
    maxStorageBytes,
    currentBytes,
    projectedBytes,
    allowed: maxStorageBytes <= 0 || projectedBytes <= maxStorageBytes,
  };
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function deleteLocationAsset(location, objectStorage) {
  if (!location) {
    return;
  }

  if (objectStorage?.enabled && objectStorage.isManagedUri(location)) {
    await objectStorage.deleteByLocation(location);
    return;
  }

  try {
    fs.rmSync(location, { force: true });
  } catch (_error) {
    // ignore local cleanup errors
  }
}

async function pruneExpiredClips({ queries, objectStorage }) {
  const { retentionDays } = getStorageConfig();
  if (retentionDays <= 0) {
    return { pruned: 0, retentionDays: 0 };
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const expired = queries.listExpiredClips(cutoff);

  let pruned = 0;
  for (const clip of expired) {
    await deleteLocationAsset(clip.filePath, objectStorage);
    await deleteLocationAsset(clip.thumbnailPath, objectStorage);
    queries.deleteClip(clip.userId, clip.id);
    pruned += 1;
  }

  return {
    pruned,
    retentionDays,
  };
}

module.exports = {
  deleteLocationAsset,
  estimateClipBytes,
  formatBytes,
  getStorageBudgetState,
  getStorageConfig,
  pruneExpiredClips,
};
