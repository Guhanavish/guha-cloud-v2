const supabase = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

let _hasDeletedAt = null;
async function _checkDeletedAt() {
  if (_hasDeletedAt !== null) return _hasDeletedAt;
  const { error } = await supabase.from('guha_cloud_files').select('deleted_at').limit(1);
  _hasDeletedAt = !error;
  if (error) console.warn('deleted_at column not available:', error.message);
  return _hasDeletedAt;
}

const File = {
  async create({ originalName, storedName, mimeType, size, path, ownerId, folderId, storageBackend, b2FileName }) {
    const fileData = {
      original_name: originalName,
      stored_name: storedName,
      mime_type: mimeType,
      size,
      path,
      owner_id: ownerId,
      folder_id: folderId || null,
      is_public: false,
      download_count: 0,
      last_accessed: new Date().toISOString(),
      storage_backend: storageBackend || 'local',
      b2_file_name: b2FileName || null
    };

    const { data, error } = await supabase
      .from('guha_cloud_files')
      .insert(fileData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findByOwner(ownerId, options = {}) {
    let query = supabase.from('guha_cloud_files').select('*', { count: 'exact' }).eq('owner_id', ownerId);
    if (await _checkDeletedAt()) query = query.is('deleted_at', null);
    
    if (options.folderId) query = query.eq('folder_id', options.folderId);
    if (options.search) query = query.ilike('original_name', `%${options.search}%`);
    
    if (options.sort) {
      const isDesc = options.sort.startsWith('-');
      const column = isDesc ? options.sort.slice(1) : options.sort;
      query = query.order(column, { ascending: !isDesc });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count };
  },

  async findById(id) {
    const { data, error } = await supabase.from('guha_cloud_files').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByOwnerAndId(ownerId, fileId) {
    const { data, error } = await supabase.from('guha_cloud_files').select('*').eq('id', fileId).eq('owner_id', ownerId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async hardDelete(id) {
    const { error } = await supabase.from('guha_cloud_files').delete().eq('id', id);
    if (error) throw error;
  },

  async softDelete(id) {
    if (!(await _checkDeletedAt())) {
      // Column doesn't exist — fall back to hard delete
      const { data: file } = await supabase.from('guha_cloud_files').select('*').eq('id', id).single();
      if (file) {
        const storage = require('../services/storage');
        await storage.deleteFile(file).catch(() => {});
      }
      return this.hardDelete(id);
    }
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async restore(id) {
    if (!(await _checkDeletedAt())) throw new Error('Recycle bin not available');
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .update({ deleted_at: null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getStorageStats(ownerId) {
    let q = supabase.from('guha_cloud_files').select('size', { count: 'exact' }).eq('owner_id', ownerId);
    if (await _checkDeletedAt()) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return {
      totalSize: data.reduce((sum, f) => sum + f.size, 0),
      fileCount: data.length
    };
  },

  async getTotalSizeByBackend(ownerId, backend) {
    let q = supabase.from('guha_cloud_files').select('size').eq('owner_id', ownerId).eq('storage_backend', backend);
    if (await _checkDeletedAt()) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).reduce((sum, f) => sum + f.size, 0);
  },

  async searchFiles(ownerId, searchTerm, options = {}) {
    let q = supabase.from('guha_cloud_files').select('*', { count: 'exact' }).eq('owner_id', ownerId);
    if (await _checkDeletedAt()) q = q.is('deleted_at', null);
    q = q.ilike('original_name', `%${searchTerm}%`);
    if (options.folderId) {
      q = q.eq('folder_id', options.folderId);
    }
    if (options.limit) q = q.limit(options.limit);
    if (options.offset) q = q.range(options.offset, options.offset + (options.limit || 20) - 1);
    q = q.order('created_at', { ascending: false });
    
    const { data, error, count } = await q;
    if (error) throw error;
    return { data, count };
  },

  async getRecycleBin(ownerId) {
    if (!(await _checkDeletedAt())) return [];
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .select('*')
      .eq('owner_id', ownerId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async cleanupExpired() {
    if (!(await _checkDeletedAt())) return 0;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expired, error: fetchError } = await supabase
      .from('guha_cloud_files')
      .select('*')
      .lt('deleted_at', twoDaysAgo);
    if (fetchError) throw fetchError;
    const storage = require('../services/storage');
    await Promise.allSettled((expired || []).map(f => storage.deleteFile(f).catch(() => {})));
    const { error: delError } = await supabase
      .from('guha_cloud_files')
      .delete()
      .lt('deleted_at', twoDaysAgo);
    if (delError) throw delError;
    return (expired || []).length;
  },

  async incrementDownload(id) {
    const { data: file } = await supabase.from('guha_cloud_files').select('download_count').eq('id', id).single();
    if (file) {
      await supabase.from('guha_cloud_files').update({ 
        download_count: file.download_count + 1, 
        last_accessed: new Date().toISOString() 
      }).eq('id', id);
    }
  },

  getExtension(mimeType) {
    const extensions = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-7z-compressed': '7z'
    };
    return extensions[mimeType] || '';
  },

  isImage(mimeType) {
    return mimeType.startsWith('image/');
  },

  isVideo(mimeType) {
    return mimeType.startsWith('video/');
  },

  isAudio(mimeType) {
    return mimeType.startsWith('audio/');
  },

  isDocument(mimeType) {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ];
    return docTypes.includes(mimeType);
  }
};

module.exports = File;