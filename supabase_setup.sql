-- CondoGov AdminAssistant - Setup Supabase Tables
-- Execute este SQL no Supabase Dashboard > SQL Editor

-- ========================================
-- CRIAR EXTENSÃO PGVECTOR (se disponível)
-- ========================================
-- Nota: Pode precisar ser habilitado pelo administrador
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ========================================
-- TABELAS DE CONHECIMENTO (RAG)
-- ========================================

-- Fontes de conhecimento por empresa e setor
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('url', 'file', 'manual')),
  uri TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chunks com embeddings para busca semântica
-- Nota: Se pgvector não disponível, remover coluna embedding por enquanto
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  -- embedding vector(3072), -- Descomentar quando pgvector disponível
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memórias do usuário para personalização
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'context', 'rule', 'fact')),
  content TEXT NOT NULL,
  -- embedding vector(3072), -- Descomentar quando pgvector disponível
  confidence FLOAT NOT NULL DEFAULT 0.5,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- TABELAS DE CHAT E SESSÕES
-- ========================================

-- Sessões de chat com contexto setorial
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'openai/gpt-5-chat',
  context_mode TEXT NOT NULL DEFAULT 'general' CHECK (context_mode IN ('general','sector')),
  sector TEXT,
  title TEXT NOT NULL DEFAULT 'Nova Conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mensagens das sessões
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content JSONB NOT NULL,
  model TEXT,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  tokens INT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feedback das mensagens
CREATE TABLE IF NOT EXISTS message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('like', 'dislike', 'favorite', 'report')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================

-- Índices de filtro por empresa/usuário
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_company_sector 
  ON knowledge_sources (company_id, sector);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_company_sector 
  ON knowledge_chunks (company_id, sector);

CREATE INDEX IF NOT EXISTS idx_user_memories_company_user 
  ON user_memories (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_company_user 
  ON chat_sessions (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time 
  ON chat_messages (session_id, timestamp);

-- Índices para busca textual
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_gin 
  ON chat_messages USING GIN (to_tsvector('portuguese', content::text));

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_gin 
  ON knowledge_chunks USING GIN (to_tsvector('portuguese', content));

-- Tags
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tags_gin 
  ON knowledge_chunks USING GIN (tags);

-- ========================================
-- ÍNDICES VETORIAIS (quando pgvector disponível)
-- ========================================

-- Descomente quando pgvector estiver habilitado:
-- CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
--   ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- CREATE INDEX IF NOT EXISTS idx_user_memories_embedding 
--   ON user_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ========================================
-- TRIGGERS PARA UPDATED_AT
-- ========================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_knowledge_sources_updated_at
    BEFORE UPDATE ON knowledge_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- RLS (ROW LEVEL SECURITY) - OPCIONAL
-- ========================================

-- Descomente se quiser ativar RLS (recomendado para produção)
-- ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies de exemplo (ajustar conforme necessário)
-- CREATE POLICY "Users can access their company data" ON knowledge_sources
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- CREATE POLICY "Users can access their company data" ON knowledge_chunks
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- CREATE POLICY "Users can access their own memories" ON user_memories
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid 
--                  AND user_id = current_setting('app.current_user'));

-- CREATE POLICY "Users can access their company sessions" ON chat_sessions
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- CREATE POLICY "Users can access messages from their sessions" ON chat_messages
--   FOR ALL USING (session_id IN (
--     SELECT id FROM chat_sessions 
--     WHERE company_id = current_setting('app.current_company')::uuid
--   ));

-- ========================================
-- SEED INICIAL DE CONHECIMENTO
-- ========================================

-- Substitua 'SUA_EMPRESA_UUID' pelo UUID real da sua empresa
-- INSERT INTO knowledge_sources (company_id, sector, title, kind) VALUES
-- ('SUA_EMPRESA_UUID', 'Dashboard', 'Conhecimento Inicial - Dashboard', 'manual'),
-- ('SUA_EMPRESA_UUID', 'Projetos', 'Conhecimento Inicial - Projetos', 'manual'),
-- ('SUA_EMPRESA_UUID', 'RH Unificado', 'Conhecimento Inicial - RH', 'manual');

-- INSERT INTO knowledge_chunks (company_id, sector, source_id, chunk_index, content, tags) VALUES
-- ('SUA_EMPRESA_UUID', 'Dashboard', (SELECT id FROM knowledge_sources WHERE sector = 'Dashboard' LIMIT 1), 0,
--  'Dashboard: visão executiva consolidada. KPIs: projetos em andamento, processos ativos, funcionários. Filtros por empresa.',
--  ARRAY['dashboard', 'kpis', 'executivo']),
-- ('SUA_EMPRESA_UUID', 'Projetos', (SELECT id FROM knowledge_sources WHERE sector = 'Projetos' LIMIT 1), 0,
--  'Projetos: gestão completa com Gantt, etapas, entregáveis, documentos. Status in_progress para KPIs.',
--  ARRAY['projetos', 'gantt', 'gestao']);

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('knowledge_sources', 'knowledge_chunks', 'user_memories', 'chat_sessions', 'chat_messages')
ORDER BY table_name;

-- Verificar extensões
SELECT extname FROM pg_extension WHERE extname = 'vector';

COMMIT;
