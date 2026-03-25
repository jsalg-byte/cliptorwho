const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
]);

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm']);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createUploader(uploadDir) {
  ensureDir(uploadDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${randomUUID()}${ext || '.mp4'}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 1024 * 1024 * 1024 * 5,
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        cb(new Error('Unsupported file extension. Allowed: .mp4 .mov .mkv .webm'));
        return;
      }
      cb(null, true);
    },
  });

  return upload;
}

async function validateVideoFile(filePath) {
  const { fileTypeFromFile } = await import('file-type');
  const detected = await fileTypeFromFile(filePath);
  if (!detected) {
    throw new Error('Unable to detect file type');
  }

  if (!ALLOWED_MIME.has(detected.mime)) {
    throw new Error(`Invalid file type: ${detected.mime}`);
  }

  return detected;
}

function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Number(metadata?.format?.duration || 0));
    });
  });
}

function safeUnlink(filePath) {
  if (!filePath) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch (_error) {
    // Ignore cleanup errors.
  }
}

module.exports = {
  createUploader,
  ensureDir,
  probeDuration,
  safeUnlink,
  validateVideoFile,
};
