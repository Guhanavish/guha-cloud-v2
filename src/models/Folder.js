const supabase = require('../lib/supabase');
const storage = require('../services/storage');

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

  async delete(id) {
    const deleteRecursive = async (folderId) => {
      const { data: children } = await supabase.from('guha_cloud_folders').select('id').eq('parent_id', folderId);
      for (const child of children || []) {
        await deleteRecursive(child.id);
      }
      // Delete files from storage backend and database
      const { data: files } = await supabase.from('guha_cloud_files').select('*').eq('folder_id', folderId);
      for (const file of files || []) {
        await storage.deleteFile(file).catch(() => {});
      }
      await supabase.from('guha_cloud_files').delete().eq('folder_id', folderId);
      await supabase.from('guha_cloud_folders').delete().eq('id', folderId);
    };
    
    await deleteRecursive(id);
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