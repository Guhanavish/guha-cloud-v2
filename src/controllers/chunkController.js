const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/File');
const storage = require('../services/storage');

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'chunks');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function getChunkDir(uploadId) {
  return path.join(TEMP_DIR, uploadId);
}

exports.initUpload = async (req, res, next) => {
  try {
    const { fileName, mimeType, size, totalChunks, folderId, storageBackend } = req.body;
    if (!fileName || !totalChunks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const backend = storageBackend || 'b2';

    const { fileId: b2FileId } = await storage.startLargeFile(backend, fileName, mimeType || 'application/octet-stream');
    const { uploadUrl, authToken } = await storage.getUploadPartUrl(backend, b2FileId);

    const uploadId = uuidv4();
    ensureTempDir();
    const dir = getChunkDir(uploadId);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      fileName,
      mimeType,
      size,
      totalChunks,
      folderId,
      storageBackend: backend,
      ownerId: req.user.id,
      b2FileId,
      uploadUrl,
      authToken,
      partSha1Array: [],
      receivedChunks: []
    }));

    res.json({ uploadId, chunkSize: 10 * 1024 * 1024 });
  } catch (error) {
    next(error);
  }
};

exports.uploadChunk = async (req, res, next) => {
  try {
    const { uploadId, chunkIndex } = req.params;
    const dir = getChunkDir(uploadId);

    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Empty chunk' });
    }
    const chunkBuffer = req.file.buffer;

    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    const partNumber = parseInt(chunkIndex) + 1;
    const { sha1 } = await storage.uploadPart(meta.storageBackend, meta.uploadUrl, meta.authToken, partNumber, chunkBuffer);

    if (!meta.receivedChunks.includes(parseInt(chunkIndex))) {
      meta.receivedChunks.push(parseInt(chunkIndex));
    }
    meta.partSha1Array.push(sha1);
    fs.writeFileSync(metaPath, JSON.stringify(meta));

    res.json({ success: true, received: meta.receivedChunks.length, total: meta.totalChunks });
  } catch (error) {
    next(error);
  }
};

exports.finalizeUpload = async (req, res, next) => {
  try {
    const { uploadId } = req.params;
    const dir = getChunkDir(uploadId);

    if (!fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    if (meta.receivedChunks.length !== meta.totalChunks) {
      return res.status(400).json({
        error: 'Not all chunks received',
        received: meta.receivedChunks.length,
        total: meta.totalChunks
      });
    }

    await storage.finishLargeFile(meta.storageBackend, meta.b2FileId, meta.partSha1Array);

    const fileDoc = await File.create({
      originalName: meta.fileName,
      storedName: meta.fileName,
      mimeType: meta.mimeType,
      size: meta.size,
      path: meta.b2FileId,
      ownerId: req.user.id,
      folderId: meta.folderId || null,
      storageBackend: meta.storageBackend,
      b2FileName: `${req.user.id}/${Date.now()}-${meta.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    });

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

    res.status(201).json({ message: 'Upload complete', file: fileDoc });
  } catch (error) {
    try { fs.rmSync(getChunkDir(uploadId), { recursive: true, force: true }); } catch {}
    next(error);
  }
};