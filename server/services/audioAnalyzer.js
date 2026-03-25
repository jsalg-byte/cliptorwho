const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
}

function bufferToFloatArray(buffer) {
  const sampleCount = Math.floor(buffer.length / 4);
  const values = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    values[i] = buffer.readFloatLE(i * 4);
  }
  return values;
}

function normalizeScores(scores) {
  const max = scores.reduce((acc, score) => Math.max(acc, score), 0);
  if (max === 0) {
    return scores.map(() => 0);
  }
  return scores.map((score) => Number(((score / max) * 100).toFixed(2)));
}

function analyzeAudio(filePath, options = {}) {
  const ffmpegPath = getFfmpegPath();
  const sampleRate = options.sampleRate || 16000;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      filePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-f',
      'f32le',
      'pipe:1',
    ];

    const ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks = [];
    let stderr = '';

    ffmpegProcess.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    ffmpegProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpegProcess.on('error', (error) => {
      reject(error);
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg audio analysis failed: ${stderr}`));
        return;
      }

      const pcmBuffer = Buffer.concat(chunks);
      const samples = bufferToFloatArray(pcmBuffer);
      const samplesPerSecond = sampleRate;
      const totalSeconds = Math.ceil(samples.length / samplesPerSecond);

      const rawScores = [];

      for (let second = 0; second < totalSeconds; second += 1) {
        const start = second * samplesPerSecond;
        const end = Math.min(start + samplesPerSecond, samples.length);
        const count = end - start;

        if (count <= 0) {
          rawScores.push(0);
          continue;
        }

        let sumSquares = 0;
        for (let i = start; i < end; i += 1) {
          const sample = samples[i];
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / count);
        rawScores.push(rms);
      }

      const normalized = normalizeScores(rawScores);
      const timeline = normalized.map((audioScore, second) => ({
        second,
        audioScore,
      }));

      resolve({
        timeline,
        stderr,
      });
    });
  });
}

module.exports = {
  analyzeAudio,
};
