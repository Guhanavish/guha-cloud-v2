const supabase = require('../lib/supabase');
const storage = require('../services/storage');

let _hasDeletedAt = null;
async function _checkDeletedAt() {
  if (_hasDeletedAt !== null) return _hasDeletedAt;
  const { error } = await supabase.from('guha_cloud_folders').select('deleted_at').limit(1);
  _hasDeletedAt = !error;
  return _hasDeletedAt;
}

const Folder = {
  async create({ name, owner }) {
    const { data, error } = await supabase
      .from('guha_cloud_folders')
      .insert({ name, owner_id: owner, parent_id: null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findByOwner(ownerId, parentId = null) {
    let query = supabase.from('guha_cloud_folders').select('*').eq('owner_id', ownerId);
    if (await _checkDeletedAt()) query = query.is('deleted_at', null);
    query = query.order('name');
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase.from('guha_cloud_folders').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByOwnerAndId(ownerId, folderId) {
    const { data, error } = await supabase.from('guha_cloud_folders').select('*').eq('id', folderId).eq('owner_id', ownerId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('guha_cloud_folders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async softDelete(id) {
    const { data: children } = await supabase.from('guha_cloud_folders').select('id').eq('parent_id', id);
    await Promise.all((children || []).map(c => this.softDelete(c.id)));
    const { data: files } = await supabase.from('guha_cloud_files').select('id').eq('folder_id', id);
    await Promise.all((files || []).map(f => {
      const File = require('./File');
      return File.softDelete(f.id);
    }));
    try {
      const { error } = await supabase.from('guha_cloud_folders').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      _hasDeletedAt = true;
    } catch {
      _hasDeletedAt = false;
      // Fallback: hard delete the folder and its files
      const { data: f2 } = await supabase.from('guha_cloud_files').select('*').eq('folder_id', id);
      await Promise.allSettled((f2 || []).map(f => storage.deleteFile(f).catch(() => {})));
      await supabase.from('guha_cloud_files').delete().eq('folder_id', id);
      await supabase.from('guha_cloud_folders').delete().eq('id', id);
    }
  },

  async restore(id) {
    if (!(await _checkDeletedAt())) throw new Error('Recycle bin not available');
    const { data: children } = await supabase.from('guha_cloud_folders').select('id').eq('parent_id', id).not('deleted_at', 'is', null);
    await Promise.all((children || []).map(c => this.restore(c.id)));
    await supabase.from('guha_cloud_files').update({ deleted_at: null }).eq('folder_id', id).is('deleted_at', 'not', null);
    await supabase.from('guha_cloud_folders').update({ deleted_at: null }).eq('id', id);
  },

  async getRecycleBin(ownerId) {
    if (!(await _checkDeletedAt())) return [];
    let query = supabase.from('guha_cloud_folders').select('*');
    if (ownerId !== '__ALL__') query = query.eq('owner_id', ownerId);
    query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async cleanupExpired() {
    if (!(await _checkDeletedAt())) return 0;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expired, error } = await supabase
      .from('guha_cloud_folders')
      .select('id')
      .lt('deleted_at', twoDaysAgo);
    if (error) throw error;
    for (const f of expired || []) {
      const { data: files } = await supabase.from('guha_cloud_files').select('*').eq('folder_id', f.id);
      await Promise.allSettled((files || []).map(ff => {
        const s = require('../services/storage');
        return s.deleteFile(ff).catch(() => {});
      }));
      const { data: children } = await supabase.from('guha_cloud_folders').select('id').eq('parent_id', f.id);
      for (const c of children || []) {
        await supabase.from('guha_cloud_files').delete().eq('folder_id', c.id);
        await supabase.from('guha_cloud_folders').delete().eq('id', c.id);
      }
      await supabase.from('guha_cloud_files').delete().eq('folder_id', f.id);
      await supabase.from('guha_cloud_folders').delete().eq('id', f.id);
    }
    return (expired || []).length;
  },

  async hardDelete(id) {
    const { error } = await supabase.from('guha_cloud_folders').delete().eq('id', id);
    if (error) throw error;
  },

  async delete(id) {
    let totalDeleted = 0;
    const deleteRecursive = async (folderId) => {
      const [filesResult, childrenResult] = await Promise.all([
        supabase.from('guha_cloud_files').select('*').eq('folder_id', folderId),
        supabase.from('guha_cloud_folders').select('id').eq('parent_id', folderId)
      ]);
      const files = filesResult.data || [];
      const children = childrenResult.data || [];
      await Promise.all(children.map(c => deleteRecursive(c.id)));
      totalDeleted += files.reduce((s, f) => s + f.size, 0);
      await Promise.allSettled(files.map(f => storage.deleteFile(f).catch(() => {})));
      await Promise.all([
        supabase.from('guha_cloud_files').delete().eq('folder_id', folderId),
        supabase.from('guha_cloud_folders').delete().eq('id', folderId)
      ]);
    };
    await deleteRecursive(id);
    return totalDeleted;
  },

  async move(id, newParentId) {
    if (id === newParentId) {
      throw new Error('Cannot move folder into itself');
    }

    // Check for circular reference
    let current = await this.findById(newParentId);
    while (current) {
      if (current.id === id) {
        throw new Error('Cannot move folder into its own descendant');
      }
      current = await this.findById(current.parent_id);
    }

    const { data, error } = await supabase
      .from('guha_cloud_folders')
      .update({ parent_id: newParentId || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getChildren(folderId) {
    const { data, error } = await supabase
      .from('guha_cloud_folders')
      .select('*')
      .eq('parent_id', folderId)
      .order('name');
    if (error) throw error;
    return data;
  },

  async getTotalSizeRecursive(folderId) {
    let total = 0;
    const getSize = async (fid) => {
      const { data: files } = await supabase.from('guha_cloud_files').select('size').eq('folder_id', fid);
      total += (files || []).reduce((sum, f) => sum + f.size, 0);
      const { data: children } = await supabase.from('guha_cloud_folders').select('id').eq('parent_id', fid);
      for (const child of children || []) {
        await getSize(child.id);
      }
    };
    await getSize(folderId);
    return total;
  },

  async getBreadcrumbs(folderId) {
    const breadcrumbs = [];
    let current = await this.findById(folderId);
    while (current) {
      breadcrumbs.unshift({ id: current.id, name: current.name });
      current = current.parent_id ? await this.findById(current.parent_id) : null;
    }
    return breadcrumbs;
  }
};

module.exports = Folder;