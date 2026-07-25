const B2 = require('backblaze-b2');

function createClient() {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  if (!keyId || !appKey) {
    throw new Error('Backblaze B2 not configured. Set B2_KEY_ID and B2_APP_KEY in .env');
  }
  return new B2({
    applicationKeyId: keyId,
    applicationKey: appKey,
    axios: { timeout: 300000 }
  });
}

const b2Provider = {
  name: 'b2',

  async upload(file, userId) {
    const b2 = createClient();

    try {
      await b2.authorize();
    } catch (e) {
      throw new Error(`B2 auth failed: ${e.response?.data?.code || e.message}`);
    }

    const bucketId = process.env.B2_BUCKET_ID;
    if (!bucketId) throw new Error('B2_BUCKET_ID not set in .env');

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${userId}/${Date.now()}-${safeName}`;

    let uploadData;
    try {
      const res = await b2.getUploadUrl(bucketId);
      uploadData = res?.data;
    } catch (e) {
      throw new Error(`B2 upload URL failed: ${e.response?.data?.code || e.message}`);
    }
    if (!uploadData?.uploadUrl) {
      throw new Error('B2: failed to get upload URL');
    }

    let response;
    try {
      response = await b2.uploadFile({
        uploadUrl: uploadData.uploadUrl,
        uploadAuthToken: uploadData.authorizationToken,
        fileName,
        data: file.buffer,
        mime: file.mimetype
      });
    } catch (e) {
      throw new Error(`B2 file upload failed: ${e.response?.data?.code || e.message}`);
    }

    const body = response?.data;
    if (!body?.fileId) {
      console.error('B2 upload response body:', JSON.stringify(body));
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

  async startLargeFile(fileName, mimeType) {
    const b2 = createClient();
    await b2.authorize();
    const bucketId = process.env.B2_BUCKET_ID;
    const res = await b2.startLargeFile({ bucketId, fileName, contentType: mimeType });
    return { fileId: res.data.fileId };
  },

  async getUploadPartUrl(fileId) {
    const b2 = createClient();
    await b2.authorize();
    const res = await b2.getUploadPartUrl({ fileId });
    return { uploadUrl: res.data.uploadUrl, authToken: res.data.authorizationToken };
  },

  async uploadPart(uploadUrl, authToken, partNumber, dataBuffer) {
    const b2 = createClient();
    // uploadPart creates its own client/authorization
    const res = await b2.uploadPart({
      uploadUrl,
      uploadAuthToken: authToken,
      partNumber,
      data: dataBuffer
    });
    return { sha1: res.data.contentSha1 };
  },

  async finishLargeFile(fileId, partSha1Array) {
    const b2 = createClient();
    await b2.authorize();
    await b2.finishLargeFile({ fileId, partSha1Array });
  },

  async delete(fileRecord) {
    const b2 = createClient();
    await b2.authorize();

    const res = await b2.getFileInfo({ fileId: fileRecord.path });
    const fileInfo = res?.data;
    if (!fileInfo?.fileName) {
      console.error('B2 getFileInfo returned no fileName for fileId:', fileRecord.path);
      return;
    }
    await b2.deleteFileVersion({
      fileId: fileRecord.path,
      fileName: fileInfo.fileName
    });
  }
};

module.exports = b2Provider;