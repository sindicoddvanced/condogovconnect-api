-- CondoGov AdminAssistant - Tabelas para Documentos e Áudio
-- Execute este SQL no Supabase Dashboard > SQL Editor

-- ========================================
-- TABELA DE DOCUMENTOS
-- ========================================

-- Documentos gerados pela IA
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx')),
  file_url TEXT,
  file_name TEXT,
  size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- TABELA DE PROCESSAMENTO DE ÁUDIO
-- ========================================

-- Processamento de áudio e transcrições
CREATE TABLE IF NOT EXISTS audio_processing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  meeting_id UUID,
  audio_file_name TEXT NOT NULL,
  audio_url TEXT,
  audio_size_bytes BIGINT,
  transcription_text TEXT,
  transcription_confidence FLOAT,
  language_detected TEXT,
  duration_seconds INT,
  speakers JSONB,
  analysis JSONB,
  processing_options JSONB,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  usage_stats JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ========================================
-- TABELA DE TEMPLATES DE DOCUMENTOS
-- ========================================

-- Templates para geração de documentos
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  template_content TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================

-- Documentos
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents (company_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents (created_by);
CREATE INDEX IF NOT EXISTS idx_documents_tags_gin ON documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin ON documents USING GIN (metadata);

-- Processamento de áudio
CREATE INDEX IF NOT EXISTS idx_audio_processing_company_id ON audio_processing (company_id);
CREATE INDEX IF NOT EXISTS idx_audio_processing_meeting_id ON audio_processing (meeting_id);
CREATE INDEX IF NOT EXISTS idx_audio_processing_status ON audio_processing (status);
CREATE INDEX IF NOT EXISTS idx_audio_processing_created_by ON audio_processing (created_by);

-- Templates
CREATE INDEX IF NOT EXISTS idx_document_templates_company_id ON document_templates (company_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates (category);
CREATE INDEX IF NOT EXISTS idx_document_templates_status ON document_templates (status);

-- Busca textual
CREATE INDEX IF NOT EXISTS idx_documents_content_gin 
  ON documents USING GIN (to_tsvector('portuguese', title || ' ' || description || ' ' || content));

CREATE INDEX IF NOT EXISTS idx_audio_transcription_gin 
  ON audio_processing USING GIN (to_tsvector('portuguese', transcription_text));

-- ========================================
-- TRIGGERS PARA UPDATED_AT
-- ========================================

-- Trigger para documents
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para templates
CREATE TRIGGER update_document_templates_updated_at
    BEFORE UPDATE ON document_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- RLS (ROW LEVEL SECURITY) - OPCIONAL
-- ========================================

-- Habilitar RLS (descomente se necessário)
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audio_processing ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

-- Policies de exemplo
-- CREATE POLICY "Users can access their company documents" ON documents
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- CREATE POLICY "Users can access their company audio processing" ON audio_processing
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- CREATE POLICY "Users can access their company templates" ON document_templates
--   FOR ALL USING (company_id = current_setting('app.current_company')::uuid);

-- ========================================
-- FUNÇÕES RPC PARA OPERAÇÕES COMPLEXAS
-- ========================================

-- Função para buscar documentos com filtros
CREATE OR REPLACE FUNCTION search_documents(
  p_company_id UUID,
  p_search_term TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  file_type TEXT,
  file_url TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  created_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id, d.title, d.description, d.file_type, d.file_url, d.tags, d.created_at, d.created_by
  FROM documents d
  WHERE d.company_id = p_company_id
    AND d.status = 'active'
    AND (p_search_term IS NULL OR 
         to_tsvector('portuguese', d.title || ' ' || COALESCE(d.description, '') || ' ' || d.content) 
         @@ plainto_tsquery('portuguese', p_search_term))
    AND (p_category IS NULL OR d.metadata->>'category' = p_category)
    AND (p_tags IS NULL OR d.tags && p_tags)
  ORDER BY d.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Função para obter estatísticas de processamento de áudio
CREATE OR REPLACE FUNCTION get_audio_processing_stats(
  p_company_id UUID,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_processed', COUNT(*),
    'total_minutes', COALESCE(SUM(duration_seconds), 0) / 60,
    'total_tokens', COALESCE(SUM((usage_stats->>'totalTokens')::int), 0),
    'by_status', json_object_agg(status, status_count),
    'by_language', json_object_agg(language_detected, language_count)
  ) INTO result
  FROM (
    SELECT 
      status,
      language_detected,
      duration_seconds,
      usage_stats,
      COUNT(*) OVER (PARTITION BY status) as status_count,
      COUNT(*) OVER (PARTITION BY language_detected) as language_count
    FROM audio_processing
    WHERE company_id = p_company_id
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to)
  ) stats;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- SEED DE TEMPLATES BÁSICOS
-- ========================================

-- Templates básicos (substitua SUA_EMPRESA_UUID pelo UUID real)
-- INSERT INTO document_templates (company_id, name, description, category, template_content, variables, tags, created_by) VALUES
-- ('SUA_EMPRESA_UUID', 'Contrato de Manutenção', 'Template para contratos de manutenção predial', 'contrato',
--  'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO
--
-- CONTRATANTE: {{empresa_nome}}
-- CNPJ: {{empresa_cnpj}}
-- Endereço: {{empresa_endereco}}
--
-- CONTRATADA: {{fornecedor_nome}}
-- CNPJ: {{fornecedor_cnpj}}
-- Endereço: {{fornecedor_endereco}}
--
-- OBJETO: {{objeto_contrato}}
-- VALOR: R$ {{valor_total}}
-- PRAZO: {{prazo_execucao}}
--
-- [Restante do template...]',
--  '{"empresa_nome": "text", "empresa_cnpj": "text", "fornecedor_nome": "text", "valor_total": "currency"}',
--  ARRAY['contrato', 'manutenção'], 'system'),

-- ('SUA_EMPRESA_UUID', 'Comunicado aos Moradores', 'Template para comunicados gerais', 'comunicado',
--  'COMUNICADO AOS MORADORES
--
-- Data: {{data_comunicado}}
-- Assunto: {{assunto}}
--
-- Prezados Moradores,
--
-- {{conteudo_principal}}
--
-- Atenciosamente,
-- {{nome_administracao}}
-- Administração do Condomínio',
--  '{"data_comunicado": "date", "assunto": "text", "conteudo_principal": "textarea"}',
--  ARRAY['comunicado', 'moradores'], 'system');

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('documents', 'audio_processing', 'document_templates')
ORDER BY table_name;

-- Verificar funções RPC criadas
SELECT proname 
FROM pg_proc 
WHERE proname IN ('search_documents', 'get_audio_processing_stats');

COMMIT;
