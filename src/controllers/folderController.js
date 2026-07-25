const Folder = require('../models/Folder');
const File = require('../models/File');
const User = require('../models/User');
const AppError = require('../utils/AppError');

exports.createFolder = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return next(new AppError('Folder name is required', 400));
    }

    const folder = await Folder.create({
      name: name.trim(),
      owner: req.user.id
    });

    res.status(201).json({ folder });
  } catch (error) {
    next(error);
  }
};

exports.getFolders = async (req, res, next) => {
  try {
    const folders = await Folder.findByOwner(req.user.id);
    res.json({ folders });
  } catch (error) {
    next(error);
  }
};

exports.getFolder = async (req, res, next) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder || folder.owner_id !== req.user.id) {
      return next(new AppError('Folder not found', 404));
    }
    res.json({ folder });
  } catch (error) {
    next(error);
  }
};

exports.updateFolder = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return next(new AppError('Folder name is required', 400));
    }

    const folder = await Folder.update(req.params.id, { name: name.trim() });
    if (!folder) {
      return next(new AppError('Folder not found', 404));
    }

    res.json({ folder });
  } catch (error) {
    next(error);
  }
};

exports.deleteFolder = async (req, res, next) => {
  try {
    const { mode } = req.body;
    const folder = await Folder.findById(req.params.id);
    if (!folder || folder.owner_id !== req.user.id) {
      return next(new AppError('Folder not found', 404));
    }

    if (mode === 'move') {
      // Move all files in folder to root
      const { data: files } = await require('../lib/supabase')
        .from('guha_cloud_files')
        .select('*')
        .eq('folder_id', req.params.id);
      for (const file of files || []) {
        await File.update(file.id, { folder_id: null });
      }
      await Folder.delete(req.params.id);
      return res.json({ message: 'Folder deleted, files moved to root' });
    }

    // Default: delete all contents
    const deletedSize = await Folder.getTotalSizeRecursive(req.params.id);
    await Folder.delete(req.params.id);

    if (deletedSize > 0) {
      const user = await User.findById(req.user.id);
      await User.update(req.user.id, { storage_used: Math.max(0, user.storage_used - deletedSize) });
    }

    res.json({ message: 'Folder and contents deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.moveFolder = async (req, res, next) => {
  try {
    const { targetParentId } = req.body;
    const folder = await Folder.findById(req.params.id);
    
    if (!folder || folder.owner_id !== req.user.id) {
      return next(new AppError('Folder not found', 404));
    }

    if (folder.id === targetParentId) {
      return next(new AppError('Cannot move folder into itself', 400));
    }

    let newPath = [];
    if (targetParentId) {
      const target = await Folder.findById(targetParentId);
      if (!target || target.owner_id !== req.user.id) {
        return next(new AppError('Target folder not found', 404));
      }
      let current = target;
      while (current) {
        newPath.unshift(current.id);
        current = await Folder.findById(current.parent_id);
      }
    }

    const oldParent = folder.parent_id;
    folder.parent_id = targetParentId || null;
    folder.path = newPath;
    await Folder.update(folder.id, { parent_id: targetParentId || null, path: newPath });

    if (oldParent) {
      // Could update children count on old parent if needed
    }
    if (targetParentId) {
      // Could update children count on new parent if needed
    }

    res.json({ folder });
  } catch (error) {
    next(error);
  }
};