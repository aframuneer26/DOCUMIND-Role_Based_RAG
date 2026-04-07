const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'rag_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        filename VARCHAR(500) NOT NULL,
        file_size INTEGER,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        faiss_index_id VARCHAR(255),
        total_chunks INTEGER DEFAULT 0,
        access_type VARCHAR(20) NOT NULL DEFAULT 'admin_only' CHECK (access_type IN ('all_users', 'admin_only', 'selected_users')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create document_access table (for selected user access)
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
        granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(document_id, user_id)
      )
    `);

    // Create document_chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        faiss_vector_id INTEGER,
        token_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create query_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS query_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        query TEXT NOT NULL,
        response TEXT,
        documents_used UUID[],
        response_time_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create index for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(document_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_access_user ON document_access(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_access_type ON documents(access_type)`);

    console.log('✅ All database tables initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
