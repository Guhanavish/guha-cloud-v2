const multer = require('multer');
const { AppError } = require('./errorHandler');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10
  }
});

const uploadMultiple = upload.array('files', 10);

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

module.exports = { handleMultipleUpload, MAX_FILE_SIZE };