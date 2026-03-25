const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function listFrames(frameDir) {
  return fs
    .readdirSync(frameDir)
    .filter((name) => /frame_\d+\.jpg$/.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function normalizeScores(scores) {
  const max = scores.reduce((acc, score) => Math.max(acc, score), 0);
  if (max === 0) {
    return scores.map(() => 0);
  }

  return scores.map((score) => Number(((score / max) * 100).toFixed(2)));
}

async function pixelDiffScore(frameAPath, frameBPath) {
  const width = 160;
  const height = 90;

  const [a, b] = await Promise.all([
    sharp(frameAPath).resize(width, height).removeAlpha().raw().toBuffer(),
    sharp(frameBPath).resize(width, height).removeAlpha().raw().toBuffer(),
  ]);

  let diffSum = 0;
  const channels = 3;
  const total = width * height * channels;

  for (let i = 0; i < total; i += 1) {
    diffSum += Math.abs(a[i] - b[i]);
  }

  const meanDiff = diffSum / total;
  return Number(((meanDiff / 255) * 100).toFixed(4));
}

function extractFrames(filePath, frameDir) {
  ensureDir(frameDir);

  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions(['-y', '-vf fps=1'])
      .output(path.join(frameDir, 'frame_%06d.jpg'))
      .on('error', (error) => reject(error))
      .on('end', () => resolve())
      .run();
  });
}

async function analyzeMotion(filePath, frameDir) {
  await extractFrames(filePath, frameDir);

  const frameFiles = listFrames(frameDir);
  if (frameFiles.length <= 1) {
    return {
      timeline: [],
      frameCount: frameFiles.length,
    };
  }

  const rawScores = [];

  for (let i = 1; i < frameFiles.length; i += 1) {
    const prev = path.join(frameDir, frameFiles[i - 1]);
    const current = path.join(frameDir, frameFiles[i]);
    const score = await pixelDiffScore(prev, current);
    rawScores.push(score);
  }

  const normalized = normalizeScores(rawScores);
  const timeline = normalized.map((motionScore, index) => ({
    second: index + 1,
    motionScore,
  }));

  return {
    timeline,
    frameCount: frameFiles.length,
  };
}

function removeDirRecursive(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (_error) {
    // Ignore cleanup errors.
  }
}

module.exports = {
  analyzeMotion,
  ensureDir,
  removeDirRecursive,
};
