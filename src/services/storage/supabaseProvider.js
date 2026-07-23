const fs = require('fs').promises;
const supabase = require('../../lib/supabase');

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'guha-cloud-files';

const supabaseProvider = {
  name: 'supabase',

  async upload(file, userId) {
    const filePath = `${userId}/${file.filename}`;
    const fileBuffer = await fs.readFile(file.path);
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, fileBuffer, {
      contentType: file.mimetype,
      upsert: true
    });
    await fs.unlink(file.path).catch(() => {});
    if (error) throw error;
    return { path: filePath };
  },

  async download(fileRecord) {
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileRecord.path);
    return { url: data.publicUrl, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([fileRecord.path]);
    if (error) throw error;
  }
};

module.exports = supabaseProvider;