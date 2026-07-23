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

module.exports = { upload, download, deleteFile, getBackendLimit, BACKEND_LIMITS };