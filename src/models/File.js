const supabase = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

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
    
    if (options.folderId) query = query.eq('folder_id', options.folderId);
    if (options.search) query = query.ilike('original_name', `%${options.search}%`);
    
    // Handle sort parameter for Supabase (format: column or -column for desc)
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

  async delete(id) {
    const { error } = await supabase.from('guha_cloud_files').delete().eq('id', id);
    if (error) throw error;
  },

  async getStorageStats(ownerId) {
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .select('size', { count: 'exact' })
      .eq('owner_id', ownerId);
    if (error) throw error;
    return {
      totalSize: data.reduce((sum, f) => sum + f.size, 0),
      fileCount: data.length
    };
  },

  async getTotalSizeByBackend(ownerId, backend) {
    const { data, error } = await supabase
      .from('guha_cloud_files')
      .select('size')
      .eq('owner_id', ownerId)
      .eq('storage_backend', backend);
    if (error) throw error;
    return (data || []).reduce((sum, f) => sum + f.size, 0);
  },

  async searchFiles(ownerId, searchTerm, options = {}) {
    let q = supabase.from('guha_cloud_files').select('*', { count: 'exact' }).eq('owner_id', ownerId);
    q = q.ilike('original_name', `%${searchTerm}%`);
    if (options.limit) q = q.limit(options.limit);
    if (options.offset) q = q.range(options.offset, options.offset + (options.limit || 20) - 1);
    q = q.order('created_at', { ascending: false });
    
    const { data, error, count } = await q;
    if (error) throw error;
    return { data, count };
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