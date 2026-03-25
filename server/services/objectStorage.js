const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

function normalizeEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }

  return `https://${raw.replace(/\/+$/, '')}`;
}

function extensionToContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.mp4') {
    return 'video/mp4';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webm') {
    return 'video/webm';
  }

  return 'application/octet-stream';
}

function createLocalStorageAdapter() {
  return {
    enabled: false,
    backend: 'local',
    toUri(_key) {
      return '';
    },
    parseUri(_location) {
      return null;
    },
    isManagedUri(_location) {
      return false;
    },
    async uploadFile() {},
    async headObject() {
      return null;
    },
    async getObject() {
      return null;
    },
    async deleteObject() {},
    async deleteByLocation() {},
    async downloadToFile() {},
  };
}

function createObjectStorage() {
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  if (backend !== 'r2') {
    return createLocalStorageAdapter();
  }

  const endpoint = normalizeEndpoint(process.env.R2_ENDPOINT);
  const bucket = String(process.env.R2_BUCKET || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    // eslint-disable-next-line no-console
    console.warn('R2 storage requested but R2 env vars are incomplete. Falling back to local storage.');
    return createLocalStorageAdapter();
  }

  const client = new S3Client({
    endpoint,
    region: 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  function toUri(key) {
    return `r2://${bucket}/${String(key || '').replace(/^\/+/, '')}`;
  }

  function parseUri(location) {
    const raw = String(location || '').trim();
    if (!raw.startsWith('r2://')) {
      return null;
    }

    const withoutProtocol = raw.slice(5);
    const slashIndex = withoutProtocol.indexOf('/');
    if (slashIndex <= 0) {
      return null;
    }

    const parsedBucket = withoutProtocol.slice(0, slashIndex);
    const key = withoutProtocol.slice(slashIndex + 1);
    if (!parsedBucket || !key) {
      return null;
    }

    return {
      bucket: parsedBucket,
      key,
    };
  }

  return {
    enabled: true,
    backend: 'r2',
    bucket,
    endpoint,
    toUri,
    parseUri,
    isManagedUri(location) {
      const parsed = parseUri(location);
      return Boolean(parsed?.bucket === bucket && parsed?.key);
    },
    async uploadFile(localPath, key, options = {}) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: String(key || '').replace(/^\/+/, ''),
        Body: fs.createReadStream(localPath),
        ContentType: options.contentType || extensionToContentType(localPath),
        CacheControl: options.cacheControl || undefined,
      }));

      return toUri(key);
    },
    async headObject(key) {
      return client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
    },
    async getObject(key, range = '') {
      return client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: range || undefined,
      }));
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
    },
    async deleteByLocation(location) {
      const parsed = parseUri(location);
      if (!parsed || parsed.bucket !== bucket) {
        return;
      }

      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: parsed.key,
      }));
    },
    async downloadToFile(key, outputPath) {
      const response = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));

      if (!response.Body) {
        throw new Error(`R2 object ${key} has no body`);
      }

      await pipeline(response.Body, fs.createWriteStream(outputPath));
      return outputPath;
    },
  };
}

module.exports = {
  createObjectStorage,
  extensionToContentType,
};
