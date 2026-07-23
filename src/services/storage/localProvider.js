const fs = require('fs').promises;

const localProvider = {
  name: 'local',

  async upload(file, userId) {
    return { path: file.path };
  },

  async download(fileRecord) {
    try {
      await fs.access(fileRecord.path);
    } catch {
      throw Object.assign(new Error('File not found on local storage (may have been lost during server restart)'), {
        statusCode: 404,
        code: 'FILE_NOT_FOUND'
      });
    }
    return { filePath: fileRecord.path, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    await fs.unlink(fileRecord.path).catch(() => {});
  }
};

module.exports = localProvider;