const path = require('path');
const File = require('../models/File');
const Folder = require('../models/Folder');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const storage = require('../services/storage');

exports.uploadFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(new AppError('No files uploaded', 400));
    }

    const defaultBackend = process.env.DEFAULT_STORAGE_BACKEND || 'supabase';
    const { folderId, storageBackend = defaultBackend } = req.body;
    const uploadedFiles = [];

    for (const file of req.files) {
      const sizeByBackend = await File.getTotalSizeByBackend(req.user.id, storageBackend);
      const limit = storage.getBackendLimit(storageBackend);

      if (sizeByBackend + file.size > limit) {
        return next(new AppError(`Not enough storage on ${storageBackend} for ${file.originalname}`, 400));
      }

      const result = await storage.upload(file, req.user.id, storageBackend);

      const fileDoc = await File.create({
        originalName: file.originalname,
        storedName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: result.path,
        ownerId: req.user.id,
        folderId: folderId || null,
        storageBackend,
        b2FileName: result.b2FileName || null
      });

      uploadedFiles.push(fileDoc);
    }

    res.status(201).json({ message: 'Files uploaded successfully', files: uploadedFiles });
  } catch (error) {
    next(error);
  }
};

exports.getFiles = async (req, res, next) => {
  try {
    const { folderId, page = 1, limit = 50, sort = '-created_at', search } = req.query;
    const options = {
      folderId: folderId === 'root' ? null : folderId,
      search,
      sort,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await File.findByOwner(req.user.id, options);
    const total = result.count || 0;
    const files = result.data || [];

    res.json({
      files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getFile = async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }
    res.json({ file });
  } catch (error) {
    next(error);
  }
};

exports.downloadFile = async (req, res, next) => {
  try {
    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord || fileRecord.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }

    await File.incrementDownload(fileRecord.id);
    const result = await storage.download(fileRecord);

    if (result.url) {
      return res.redirect(result.url);
    }
    if (result.buffer) {
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.original_name}"`);
      return res.send(result.buffer);
    }
    return next(new AppError('Download failed', 500));
  } catch (error) {
    next(error);
  }
};

exports.deleteFile = async (req, res, next) => {
  try {
    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord || fileRecord.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }

    await storage.deleteFile(fileRecord);
    await File.delete(fileRecord.id);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.renameFile = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return next(new AppError('File name is required', 400));
    }

    const ext = path.extname(req.params.id);
    const newName = name.trim() + ext;

    const file = await File.update(req.params.id, { original_name: newName });

    if (!file) {
      return next(new AppError('File not found', 404));
    }

    res.json({ file });
  } catch (error) {
    next(error);
  }
};

exports.moveFile = async (req, res, next) => {
  try {
    const { folderId } = req.body;
    const file = await File.findById(req.params.id);

    if (!file || file.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }

    if (folderId) {
      const folder = await Folder.findById(folderId);
      if (!folder || folder.owner_id !== req.user.id) {
        return next(new AppError('Target folder not found', 404));
      }
    }

    const fileUpdated = await File.update(req.params.id, { folder_id: folderId || null });
    res.json({ file: fileUpdated });
  } catch (error) {
    next(error);
  }
};

exports.getStorageStats = async (req, res, next) => {
  try {
    const { backend } = req.query;
    const backends = backend ? [backend] : ['supabase', 'b2'];
    const stats = {};

    for (const b of backends) {
      const used = await File.getTotalSizeByBackend(req.user.id, b);
      stats[b] = {
        used,
        limit: storage.getBackendLimit(b),
        available: storage.getBackendLimit(b) - used
      };
    }

    res.json({ stats });
  } catch (error) {
    next(error);
  }
};

exports.searchFiles = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q || !q.trim()) {
      return res.json({ files: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    }

    const options = {
      search: q.trim(),
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      sort: '-created_at'
    };

    const result = await File.searchFiles(req.user.id, options.search, options);
    const total = result.count || 0;
    const files = result.data || [];

    res.json({
      files,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    next(error);
  }
};