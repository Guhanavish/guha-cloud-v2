-- Supabase PostgreSQL Schema for Guha Cloud Storage
-- Table name: guha_cloud (with partitioned tables for users, files, folders)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS TABLE (guha_cloud_users)
-- ============================================
CREATE TABLE guha_cloud_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    storage_limit BIGINT DEFAULT 1073741824, -- 1GB in bytes
    storage_used BIGINT DEFAULT 0,
    last_login TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX idx_guha_cloud_users_username ON guha_cloud_users(username);
CREATE INDEX idx_guha_cloud_users_email ON guha_cloud_users(email);
CREATE INDEX idx_guha_cloud_users_active ON guha_cloud_users(is_active);

-- ============================================
-- FOLDERS TABLE (guha_cloud_folders)
-- ============================================
CREATE TABLE guha_cloud_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES guha_cloud_users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES guha_cloud_folders(id) ON DELETE CASCADE,
    path UUID[] DEFAULT '{}', -- Array of ancestor folder IDs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, parent_id, name)
);

-- Indexes for folders
CREATE INDEX idx_guha_cloud_folders_owner ON guha_cloud_folders(owner_id);
CREATE INDEX idx_guha_cloud_folders_parent ON guha_cloud_folders(parent_id);
CREATE INDEX idx_guha_cloud_folders_path ON guha_cloud_folders USING GIN(path);

-- ============================================
-- FILES TABLE (guha_cloud_files)
-- ============================================
CREATE TABLE guha_cloud_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    path TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES guha_cloud_users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES guha_cloud_folders(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT false,
    public_id UUID UNIQUE,
    download_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for files
CREATE INDEX idx_guha_cloud_files_owner ON guha_cloud_files(owner_id);
CREATE INDEX idx_guha_cloud_files_folder ON guha_cloud_files(folder_id);
CREATE INDEX idx_guha_cloud_files_owner_folder ON guha_cloud_files(owner_id, folder_id);
CREATE INDEX idx_guha_cloud_files_public ON guha_cloud_files(public_id) WHERE is_public = true;

-- ============================================
-- SESSIONS TABLE (for express-session with connect-pg-simple)
-- ============================================
CREATE TABLE guha_cloud_sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_guha_cloud_sessions_expire ON guha_cloud_sessions(expire);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE guha_cloud_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE guha_cloud_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE guha_cloud_files ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON guha_cloud_users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON guha_cloud_users
    FOR UPDATE USING (auth.uid() = id);

-- Folders: users can only access their own folders
CREATE POLICY "Users can manage own folders" ON guha_cloud_folders
    FOR ALL USING (owner_id = auth.uid());

-- Files: users can only access their own files
CREATE POLICY "Users can manage own files" ON guha_cloud_files
    FOR ALL USING (owner_id = auth.uid());

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_guha_cloud_folders_updated_at
    BEFORE UPDATE ON guha_cloud_folders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guha_cloud_files_updated_at
    BEFORE UPDATE ON guha_cloud_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guha_cloud_users_updated_at
    BEFORE UPDATE ON guha_cloud_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get storage stats for a user
CREATE OR REPLACE FUNCTION get_user_storage_stats(user_uuid UUID)
RETURNS TABLE(total_size BIGINT, file_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(SUM(size), 0), COUNT(*)
    FROM guha_cloud_files
    WHERE owner_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Check if user can upload (storage quota)
CREATE OR REPLACE FUNCTION can_user_upload(user_uuid UUID, file_size BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    storage_used BIGINT;
    storage_limit BIGINT;
BEGIN
    SELECT storage_used, storage_limit INTO storage_used, storage_limit
    FROM guha_cloud_users WHERE id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN (storage_used + file_size) <= storage_limit;
END;
$$ LANGUAGE plpgsql;

-- Increment storage used
CREATE OR REPLACE FUNCTION increment_storage_used(user_uuid UUID, file_size BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE guha_cloud_users
    SET storage_used = storage_used + file_size
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Decrement storage used
CREATE OR REPLACE FUNCTION decrement_storage_used(user_uuid UUID, file_size BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE guha_cloud_users
    SET storage_used = storage_used - file_size
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Recursive folder deletion (for cascading deletes)
CREATE OR REPLACE FUNCTION delete_folder_recursive(folder_uuid UUID)
RETURNS VOID AS $$
DECLARE
    child_folder RECORD;
    file_rec RECORD;
BEGIN
    -- Delete all files in this folder
    DELETE FROM guha_cloud_files WHERE folder_id = folder_uuid;
    
    -- Recursively delete child folders
    FOR child_folder IN SELECT id FROM guha_cloud_folders WHERE parent_id = folder_uuid LOOP
        PERFORM delete_folder_recursive(child_folder.id);
    END LOOP;
    
    -- Delete this folder
    DELETE FROM guha_cloud_folders WHERE id = folder_uuid;
END;
$$ LANGUAGE plpgsql;

-- Get folder breadcrumb path
CREATE OR REPLACE FUNCTION get_folder_path(folder_uuid UUID)
RETURNS TABLE(id UUID, name TEXT) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE folder_path AS (
        SELECT id, name, parent_id, 1 as level
        FROM guha_cloud_folders WHERE id = folder_uuid
        UNION ALL
        SELECT f.id, f.name, f.parent_id, fp.level + 1
        FROM guha_cloud_folders f
        JOIN folder_path fp ON f.id = fp.parent_id
    )
    SELECT id, name FROM folder_path ORDER BY level DESC;
END;
$$ LANGUAGE plpgsql;