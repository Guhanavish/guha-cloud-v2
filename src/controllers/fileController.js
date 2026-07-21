const fs = require('fs').promises;
const path = require('path');
const File = require('../models/File');
const Folder = require('../models/Folder');
const User = require('../models/User');
const AppError = require('../utils/AppError');

exports.uploadFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(new AppError('No files uploaded', 400));
    }

    const { folderId } = req.body;
    const uploadedFiles = [];

    for (const file of req.files) {
      const user = await User.findById(req.user.id);
      const stats = await File.getStorageStats(user.id);
      
      if (stats.total_size + file.size > user.storage_limit) {
        await fs.unlink(file.path).catch(() => {});
        return next(new AppError(`Not enough storage for ${file.originalname}`, 400));
      }

      const fileDoc = await File.create({
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        ownerId: req.user.id,
        folderId: folderId || null
      });

      await User.update(req.user.id, { storage_used: user.storage_used + file.size });

      uploadedFiles.push(fileDoc);
    }

    res.status(201).json({ message: 'Files uploaded successfully', files: uploadedFiles });
  } catch (error) {
    if (req.files) {
      await Promise.all(req.files.map(f => fs.unlink(f.path).catch(() => {})));
    }
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
    const file = await File.findById(req.params.id);
    if (!file || file.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }

    await File.incrementDownload(file.id);
    res.download(file.path, file.original_name);
  } catch (error) {
    next(error);
  }
};

exports.deleteFile = async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file || file.owner_id !== req.user.id) {
      return next(new AppError('File not found', 404));
    }

    await fs.unlink(file.path).catch(() => {});
    
    const user = await User.findById(req.user.id);
    await File.delete(file.id);
    await User.update(req.user.id, { storage_used: Math.max(0, user.storage_used - file.size) });

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
    const stats = await File.getStorageStats(req.user.id);
    const user = await User.findById(req.user.id);
    
    res.json({
      used: stats.totalSize || 0,
      limit: user.storage_limit,
      available: user.storage_limit - (stats.totalSize || 0),
      fileCount: stats.fileCount || 0
    });
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