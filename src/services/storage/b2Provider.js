const fs = require('fs').promises;
const B2 = require('backblaze-b2');

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

let authorized = false;

async function ensureAuth() {
  if (!authorized) {
    await b2.authorize();
    authorized = true;
  }
}

const b2Provider = {
  name: 'b2',

  async upload(file, userId) {
    await ensureAuth();
    const bucketId = process.env.B2_BUCKET_ID;
    const fileName = `${userId}/${file.filename}`;
    const fileBuffer = await fs.readFile(file.path);
    const { data } = await b2.uploadFile({
      bucketId,
      fileName,
      data: fileBuffer,
      contentType: file.mimetype
    });
    await fs.unlink(file.path).catch(() => {});
    return { path: data.fileId, b2FileName: fileName };
  },

  async download(fileRecord) {
    await ensureAuth();
    const { data } = await b2.downloadFileById({
      fileId: fileRecord.path
    });
    return { buffer: data, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    await ensureAuth();
    const { data: fileInfo } = await b2.getFileInfo({ fileId: fileRecord.path });
    await b2.deleteFileVersion({
      fileId: fileRecord.path,
      fileName: fileInfo.fileName
    });
  }
};

module.exports = b2Provider;