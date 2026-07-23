const localProvider = require('./localProvider');
const supabaseProvider = require('./supabaseProvider');
const b2Provider = require('./b2Provider');

const providers = {
  local: localProvider,
  supabase: supabaseProvider,
  b2: b2Provider
};

function getProvider(backend) {
  const provider = providers[backend];
  if (!provider) {
    throw new Error(`Unknown storage backend: ${backend}`);
  }
  return provider;
}

async function upload(file, userId, backend = 'local') {
  return getProvider(backend).upload(file, userId);
}

async function download(fileRecord) {
  return getProvider(fileRecord.storage_backend || 'local').download(fileRecord);
}

async function deleteFile(fileRecord) {
  return getProvider(fileRecord.storage_backend || 'local').delete(fileRecord);
}

module.exports = { upload, download, deleteFile, providers, getProvider };