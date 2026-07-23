const fs = require('fs').promises;

const localProvider = {
  name: 'local',

  async upload(file, userId) {
    return { path: file.path };
  },

  async download(fileRecord) {
    return { filePath: fileRecord.path, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    await fs.unlink(fileRecord.path).catch(() => {});
  }
};

module.exports = localProvider;