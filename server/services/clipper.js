const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { randomUUID } = require('crypto');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeUnlink(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_error) {
    // ignore cleanup errors
  }
}

function runFfmpeg(configure) {
  return new Promise((resolve, reject) => {
    const command = configure(ffmpeg());
    command
      .on('error', (error) => reject(error))
      .on('end', () => resolve())
      .run();
  });
}

async function getTwitchPlaybackUrl(channel) {
  const sanitized = String(channel || '').trim().toLowerCase();
  if (!sanitized) {
    throw new Error('Missing Twitch channel');
  }

  const randomSeed = Math.floor(Math.random() * 999999);
  return `https://usher.ttvnw.net/api/channel/hls/${sanitized}.m3u8?allow_source=true&allow_audio_only=true&type=any&p=${randomSeed}`;
}

async function getKickPlaybackUrl(channel) {
  const sanitized = String(channel || '').trim().toLowerCase();
  if (!sanitized) {
    throw new Error('Missing Kick channel');
  }

  const response = await axios.get(`https://kick.com/api/v2/channels/${sanitized}`);
  const playbackUrl =
    response.data?.playback_url ||
    response.data?.livestream?.playback_url ||
    response.data?.stream?.playback_url;

  if (!playbackUrl) {
    throw new Error('Unable to resolve Kick playback URL');
  }

  return playbackUrl;
}

async function resolvePlaybackUrl(platform, channel) {
  if (platform === 'twitch') {
    return getTwitchPlaybackUrl(channel);
  }

  if (platform === 'kick') {
    return getKickPlaybackUrl(channel);
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function extractClip({ playbackUrl, outputPath, duration }) {
  await runFfmpeg((command) =>
    command
      .input(playbackUrl)
      .outputOptions([
        '-y',
        '-t',
        String(duration),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
      ])
      .output(outputPath),
  );
}

async function extractThumbnail({ filePath, thumbnailPath }) {
  await runFfmpeg((command) =>
    command
      .input(filePath)
      .outputOptions(['-y', '-ss', '00:00:01', '-vframes', '1'])
      .output(thumbnailPath),
  );
}

function createShareToken() {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

async function uploadClipArtifacts({
  clipId,
  localClipPath,
  localThumbPath,
  objectStorage,
}) {
  if (!objectStorage?.enabled) {
    return {
      filePath: localClipPath,
      thumbnailPath: localThumbPath,
    };
  }

  const clipKey = `clips/${clipId}.mp4`;
  const thumbKey = `thumbs/${clipId}.jpg`;

  const remoteClipPath = await objectStorage.uploadFile(localClipPath, clipKey, {
    contentType: 'video/mp4',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const remoteThumbPath = await objectStorage.uploadFile(localThumbPath, thumbKey, {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000, immutable',
  });

  safeUnlink(localClipPath);
  safeUnlink(localThumbPath);

  return {
    filePath: remoteClipPath,
    thumbnailPath: remoteThumbPath,
  };
}

async function clipStream({
  userId,
  platform,
  channel,
  duration,
  source,
  clipsDir,
  thumbsDir,
  queries,
  objectStorage,
  tags = [],
  combinedScore = null,
}) {
  ensureDir(clipsDir);
  ensureDir(thumbsDir);

  const playbackUrl = await resolvePlaybackUrl(platform, channel);
  const id = randomUUID();

  const outputPath = path.join(clipsDir, `${id}.mp4`);
  const thumbnailPath = path.join(thumbsDir, `${id}.jpg`);

  await extractClip({
    playbackUrl,
    outputPath,
    duration,
  });

  await extractThumbnail({
    filePath: outputPath,
    thumbnailPath,
  });

  const fileSize = getFileSize(outputPath);

  const storagePaths = await uploadClipArtifacts({
    clipId: id,
    localClipPath: outputPath,
    localThumbPath: thumbnailPath,
    objectStorage,
  });

  const clip = queries.insertClip({
    id,
    userId,
    title: `${channel} clip`,
    platform,
    channel,
    duration: Number(duration),
    fileSize,
    filePath: storagePaths.filePath,
    thumbnailPath: storagePaths.thumbnailPath,
    tags,
    source,
    combinedScore,
    shareToken: createShareToken(),
    createdAt: new Date().toISOString(),
  });

  return clip;
}

async function resolveLocalSourceFile({ clip, clipsDir, objectStorage }) {
  if (!objectStorage?.enabled) {
    return {
      inputPath: clip.filePath,
      cleanupPath: '',
    };
  }

  const parsed = objectStorage.parseUri(clip.filePath);
  if (!parsed?.key) {
    return {
      inputPath: clip.filePath,
      cleanupPath: '',
    };
  }

  ensureDir(clipsDir);
  const tempPath = path.join(clipsDir, `${clip.id}_source_${Date.now()}.mp4`);
  await objectStorage.downloadToFile(parsed.key, tempPath);

  return {
    inputPath: tempPath,
    cleanupPath: tempPath,
  };
}

async function trimClip({ userId, clip, start, end, clipsDir, thumbsDir, queries, objectStorage }) {
  ensureDir(clipsDir);
  ensureDir(thumbsDir);

  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart + 0.1, Number(end) || clip.duration);

  const { inputPath, cleanupPath } = await resolveLocalSourceFile({ clip, clipsDir, objectStorage });
  const nextPath = path.join(clipsDir, `${clip.id}_trimmed_${Date.now()}.mp4`);
  const nextThumbPath = path.join(thumbsDir, `${clip.id}_trimmed_${Date.now()}.jpg`);

  try {
    await runFfmpeg((command) =>
      command
        .input(inputPath)
        .outputOptions([
          '-y',
          '-ss',
          String(safeStart),
          '-to',
          String(safeEnd),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
        ])
        .output(nextPath),
    );

    await extractThumbnail({
      filePath: nextPath,
      thumbnailPath: nextThumbPath,
    });

    const fileSize = getFileSize(nextPath);

    let nextFilePath = clip.filePath;
    let nextThumbnailPath = clip.thumbnailPath;

    if (objectStorage?.enabled) {
      const clipParsed = objectStorage.parseUri(clip.filePath);
      const thumbParsed = objectStorage.parseUri(clip.thumbnailPath);

      const clipKey = clipParsed?.key || `clips/${clip.id}.mp4`;
      const thumbKey = thumbParsed?.key || `thumbs/${clip.id}.jpg`;

      nextFilePath = await objectStorage.uploadFile(nextPath, clipKey, {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      nextThumbnailPath = await objectStorage.uploadFile(nextThumbPath, thumbKey, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      safeUnlink(nextPath);
      safeUnlink(nextThumbPath);
    } else {
      const finalFilePath = clip.filePath || path.join(clipsDir, `${clip.id}.mp4`);
      const finalThumbPath = clip.thumbnailPath || path.join(thumbsDir, `${clip.id}.jpg`);

      safeUnlink(finalFilePath);
      safeUnlink(finalThumbPath);

      fs.renameSync(nextPath, finalFilePath);
      fs.renameSync(nextThumbPath, finalThumbPath);

      nextFilePath = finalFilePath;
      nextThumbnailPath = finalThumbPath;
    }

    return queries.updateClipMedia(userId, clip.id, {
      duration: Number((safeEnd - safeStart).toFixed(2)),
      fileSize,
      filePath: nextFilePath,
      thumbnailPath: nextThumbnailPath,
    });
  } finally {
    if (cleanupPath) {
      safeUnlink(cleanupPath);
    }
  }
}

module.exports = {
  clipStream,
  extractThumbnail,
  resolvePlaybackUrl,
  trimClip,
};
