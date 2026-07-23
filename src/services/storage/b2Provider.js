const B2 = require('backblaze-b2');

function createClient() {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  if (!keyId || !appKey) {
    throw new Error('Backblaze B2 not configured. Set B2_KEY_ID and B2_APP_KEY in .env');
  }
  return new B2({ applicationKeyId: keyId, applicationKey: appKey });
}

const b2Provider = {
  name: 'b2',

  async upload(file, userId) {
    const b2 = createClient();
    await b2.authorize();

    const bucketId = process.env.B2_BUCKET_ID;
    if (!bucketId) throw new Error('B2_BUCKET_ID not set in .env');

    const fileName = `${userId}/${Date.now()}-${file.originalname}`;

    const response = await b2.uploadFile({
      bucketId,
      fileName,
      data: file.buffer,
      contentType: file.mimetype
    });

    if (!response?.data?.fileId) {
      throw new Error('B2 upload failed: no fileId returned');
    }

    return { path: response.data.fileId, b2FileName: fileName };
  },

  async download(fileRecord) {
    const b2 = createClient();
    await b2.authorize();

    const response = await b2.downloadFileById({ fileId: fileRecord.path });
    return { buffer: response.data, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    const b2 = createClient();
    await b2.authorize();

    const { data: fileInfo } = await b2.getFileInfo({ fileId: fileRecord.path });
    await b2.deleteFileVersion({
      fileId: fileRecord.path,
      fileName: fileInfo.fileName
    });
  }
};

module.exports = b2Provider;