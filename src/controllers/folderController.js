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
      const sup = require('../lib/supabase');
      const { data: files } = await sup.from('guha_cloud_files').select('id').eq('folder_id', req.params.id);
      await Promise.all((files || []).map(f => File.update(f.id, { folder_id: null })));
      await Folder.delete(req.params.id);
      return res.json({ message: 'Folder deleted, files moved to root' });
    }

    // Soft-delete all files inside, then delete folder permanently
    await Folder.softDeleteContents(req.params.id);

    res.json({ message: 'Folder deleted, files moved to recycle bin' });
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
    }
    if (targetParentId) {
    }

    res.json({ folder });
  } catch (error) {
    next(error);
  }
};
