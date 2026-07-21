const supabaseUrl = 'https://cgcpppwirjzmbicznltc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnY3BwcHdpcmp6bWJpY3pubHRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU0NTE5MiwiZXhwIjoyMTAwMTIxMTkyfQ.5BJXGj5xmxYLz65Gihdv1yPYVIIkr9uK5qMbSodwRhA';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;