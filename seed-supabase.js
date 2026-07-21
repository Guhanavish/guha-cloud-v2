require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  try {
    console.log('Connecting to Supabase...');
    
    // Delete all existing users
    const { error: deleteError } = await supabase
      .from('guha_cloud_users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteError) {
      console.error('Error deleting users:', deleteError);
    } else {
      console.log('Deleted existing users');
    }

    // Create the single user
    const hashedPassword = await bcrypt.hash('20385', 12);
    const { data, error } = await supabase
      .from('guha_cloud_users')
      .insert({
        username: 'guha',
        email: 'guha@local.dev',
        password_hash: hashedPassword,
        storage_limit: 1 * 1024 * 1024 * 1024
      })
      .select()
      .single();

    if (error) throw error;
    
    console.log('Created user:', data.username, '/ 20385');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();