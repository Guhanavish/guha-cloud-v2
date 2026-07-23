const supabase = require('../../lib/supabase');

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'guha-cloud-files';

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: null
    });
    if (error && !error.message?.includes('already exists')) {
      console.error('Failed to create Supabase storage bucket:', error);
    }
  }
}

let bucketEnsured = false;

const supabaseProvider = {
  name: 'supabase',

  async upload(file, userId) {
    if (!bucketEnsured) {
      await ensureBucket();
      bucketEnsured = true;
    }

    const filePath = `${userId}/${file.originalname}`;
    const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

    if (error) {
      console.error('Supabase Storage upload error:', error);
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return { path: filePath };
  },

  async download(fileRecord) {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(fileRecord.path, 3600);
    if (error || !data?.signedUrl) {
      console.error('Supabase signed URL error:', error);
      throw new Error('Failed to generate download link');
    }
    return { url: data.signedUrl, fileName: fileRecord.original_name };
  },

  async delete(fileRecord) {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([fileRecord.path]);
    if (error) console.error('Supabase Storage delete error:', error);
  }
};

module.exports = supabaseProvider;