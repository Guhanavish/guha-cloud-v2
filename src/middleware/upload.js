const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('./errorHandler');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024;
const ALLOWED_TYPES = process.env.ALLOWED_FILE_TYPES?.split(',') || [];

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userId = req.user.id;
    const userUploadPath = path.join(__dirname, '../../public/uploads', userId);
    try {
      await fs.mkdir(userUploadPath, { recursive: true });
    } catch (e) {
      // Directory might already exist
    }
    cb(null, userUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.length > 0) {
    const allowed = ALLOWED_TYPES.some(type => {
      if (type.endsWith('/*')) {
        const prefix = type.slice(0, -1); // e.g., "image/"
        return file.mimetype.startsWith(prefix);
      }
      return type === file.mimetype;
    });
    if (!allowed) {
      return cb(new AppError('File type not allowed', 400), false);
    }
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10
  }
});

const uploadSingle = upload.single('file');
const uploadMultiple = upload.array('files', 10);

const handleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return next(new AppError(err.message, 400));
      }
      return next(err);
    }
    next();
  });
};

const handleMultipleUpload = (req, res, next) => {
  uploadMultiple(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return next(new AppError(err.message, 400));
      }
      return next(err);
    }
    next();
  });
};

module.exports = { upload, handleUpload, handleMultipleUpload, MAX_FILE_SIZE };