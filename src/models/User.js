const supabase = require('../lib/supabase');
const bcrypt = require('bcryptjs');

const User = {
  async create({ username, email, password }) {
    const hashedPassword = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .insert({ username, email, password_hash: hashedPassword, storage_limit: 1 * 1024 * 1024 * 1024 })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async findByUsername(username) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .select('*')
      .eq('username', username)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByEmail(email) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .select('*')
      .eq('email', email)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByIdentifier(identifier) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .select('*')
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findByIdWithPassword(id) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase
      .from('guha_cloud_users')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async comparePassword(candidatePassword, hashedPassword) {
    return bcrypt.compare(candidatePassword, hashedPassword);
  },

  getPublicProfile(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      storageLimit: user.storage_limit,
      storageUsed: user.storage_used,
      storageAvailable: user.storage_limit - user.storage_used,
      lastLogin: user.last_login,
      createdAt: user.created_at
    };
  },

  canUpload(user, fileSize) {
    return user.storage_used + fileSize <= user.storage_limit;
  }
};

module.exports = User;