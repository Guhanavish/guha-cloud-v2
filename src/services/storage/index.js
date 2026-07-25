const supabaseProvider = require('./supabaseProvider');
const b2Provider = require('./b2Provider');

const providers = {
  supabase: supabaseProvider,
  b2: b2Provider
};

const BACKEND_LIMITS = {
  supabase: parseInt(process.env.SUPABASE_STORAGE_LIMIT) || 1 * 1024 * 1024 * 1024,
  b2: parseInt(process.env.B2_STORAGE_LIMIT) || 10 * 1024 * 1024 * 1024
};

function getProvider(backend) {
  const provider = providers[backend];
  if (!provider) throw new Error(`Unknown storage backend: ${backend}`);
  return provider;
}

async function upload(file, userId, backend = 'supabase') {
  return getProvider(backend).upload(file, userId);
}

async function download(fileRecord) {
  return getProvider(fileRecord.storage_backend || 'supabase').download(fileRecord);
}

async function deleteFile(fileRecord) {
  return getProvider(fileRecord.storage_backend || 'supabase').delete(fileRecord);
}

function getBackendLimit(backend) {
  return BACKEND_LIMITS[backend] || BACKEND_LIMITS.supabase;
}

async function startLargeFile(backend, fileName, mimeType) {
  return getProvider(backend).startLargeFile(fileName, mimeType);
}

async function getUploadPartUrl(backend, fileId) {
  return getProvider(backend).getUploadPartUrl(fileId);
}

async function uploadPart(backend, uploadUrl, authToken, partNumber, data) {
  return getProvider(backend).uploadPart(uploadUrl, authToken, partNumber, data);
}

async function finishLargeFile(backend, fileId, partSha1Array) {
  return getProvider(backend).finishLargeFile(fileId, partSha1Array);
}

module.exports = { upload, download, deleteFile, getBackendLimit, BACKEND_LIMITS, startLargeFile, getUploadPartUrl, uploadPart, finishLargeFile };