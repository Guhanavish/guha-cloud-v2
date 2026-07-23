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

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${userId}/${Date.now()}-${safeName}`;

    const response = await b2.uploadFile({
      bucketId,
      fileName,
      data: file.buffer,
      contentType: file.mimetype
    });

    const body = response?.data;
    if (!body?.fileId) {
      console.error('B2 upload response:', JSON.stringify(body));
      throw new Error('B2 upload failed: no fileId returned');
    }

    return { path: body.fileId, b2FileName: fileName };
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
    if (!fileInfo) {
      console.error('B2 getFileInfo returned no data for fileId:', fileRecord.path);
      return;
    }
    await b2.deleteFileVersion({
      fileId: fileRecord.path,
      fileName: fileInfo.fileName
    });
  }
};

module.exports = b2Provider;