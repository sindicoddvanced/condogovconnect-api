# CondoGov AdminAssistant API - Setup RAG & Memória

## ✅ O que foi implementado

### 1. Estrutura do Banco de Dados (PostgreSQL + pgvector)
- **`database/schema.sql`** - DDL completo com tabelas para:
  - `knowledge_sources` - Fontes de conhecimento por empresa/setor
  - `knowledge_chunks` - Chunks com embeddings (3072D) para busca semântica
  - `chat_sessions` - Sessões com contexto setorial
  - `chat_messages` - Mensagens persistentes
  - `user_memories` - Memórias do usuário para personalização
  - `message_feedback` - Feedback para melhoria contínua

### 2. Serviços RAG e IA
- **`src/services/embeddingService.ts`** - Geração de embeddings (OpenAI text-embedding-3-large)
- **`src/services/ragService.ts`** - RAG com busca semântica e memória
- **`src/services/databaseAdapter.ts`** - Adapter PostgreSQL (mock + exemplo real)
- **`src/services/sessionPersistence.ts`** - Persistência de sessões
- **`src/services/aiService.ts`** - Integrado com RAG e contexto setorial

### 3. Rotas Atualizadas
- **Headers obrigatórios**: `x-company-id`, `x-user-id`
- **Novos campos**: `contextMode` ("general"|"sector"), `sector`
- **Respostas enriquecidas**: citações, memórias usadas, contexto

### 4. Tipos TypeScript
- **`src/types/ai.ts`** - Interfaces completas para RAG, memória e contexto

### 5. Seed de Conhecimento
- **`database/seed.sql`** - Conhecimento inicial por setor (14 setores)

## 🚀 Como usar

### 1. Configurar Banco de Dados
```bash
# Executar DDL
psql -d sua_database -f database/schema.sql

# Executar seed (substituir COMPANY_ID_AQUI pelo UUID real)
sed 's/COMPANY_ID_AQUI/12345678-1234-1234-1234-123456789012/g' database/seed.sql > seed_company.sql
psql -d sua_database -f seed_company.sql
```

### 2. Variáveis de Ambiente
```env
# Existing
OPENROUTER_API_KEY=your_openrouter_key
SITE_URL=http://localhost:3000
SITE_NAME=CondoGov AdminAssistant

# New
OPENAI_API_KEY=your_openai_key  # Para embeddings
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### 3. Processar Embeddings
```javascript
// Script para processar chunks sem embedding
const embeddingService = new EmbeddingService();
const chunks = await db.query('SELECT id, content FROM knowledge_chunks WHERE embedding IS NULL');

for (const chunk of chunks.rows) {
  const embedding = await embeddingService.generateEmbedding(chunk.content);
  await db.query('UPDATE knowledge_chunks SET embedding = $1 WHERE id = $2', [
    JSON.stringify(embedding), chunk.id
  ]);
}
```

## 📡 Endpoints Atualizados

### Chat com RAG
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "x-company-id: 12345678-1234-1234-1234-123456789012" \
  -H "x-user-id: user-456" \
  -d '{
    "message": "Quais projetos estão em andamento?",
    "model": "openai/gpt-5-chat",
    "userId": "user-456",
    "contextMode": "sector",
    "sector": "Projetos"
  }'
```

### Resposta com RAG
```json
{
  "success": true,
  "data": {
    "response": {
      "message": "Baseado no conhecimento da empresa...",
      "citations": [
        {
          "chunkId": "chunk-1",
          "sector": "Projetos", 
          "content": "Informação relevante...",
          "score": 0.85
        }
      ],
      "memoryUsed": [
        {
          "content": "Usuário prefere relatórios detalhados",
          "memoryType": "preference"
        }
      ]
    },
    "session": { "id": "session-123", "contextMode": "sector", "sector": "Projetos" },
    "context": { "mode": "sector", "sector": "Projetos", "company": "uuid" }
  }
}
```

### Criar Sessão Setorial
```bash
curl -X POST http://localhost:3000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -H "x-company-id: 12345678-1234-1234-1234-123456789012" \
  -d '{
    "userId": "user-456",
    "model": "openai/gpt-5-chat",
    "contextMode": "sector",
    "sector": "RH Unificado"
  }'
```

## 🧠 Como Funciona o RAG

### 1. Fluxo da Consulta
1. **Usuário** envia pergunta com contexto (geral/setorial)
2. **Embedding** da pergunta é gerado
3. **Busca semântica** nos chunks relevantes (por empresa + setor opcional)
4. **Memórias do usuário** são recuperadas
5. **Prompt enriquecido** é montado com conhecimento + memórias
6. **IA responde** com contexto fundamentado
7. **Novas memórias** são extraídas da conversa

### 2. Contexto Setorial vs Geral
- **Geral**: Busca em todos os setores da empresa
- **Setorial**: Busca apenas no setor específico (mais precisão)

### 3. Memória e Aprendizado
- **Preferências**: "Prefiro relatórios detalhados"
- **Contexto**: "Nossa empresa usa metodologia X"
- **Regras**: "Nossa política é Y"
- **Fatos**: "Nosso sistema tem Z funcionalidades"

## 🔧 Próximos Passos

### 1. Conectar PostgreSQL Real
- Implementar `PostgreSQLAdapter` e `PostgreSQLSessionPersistence`
- Configurar connection pool
- Ativar RLS (Row Level Security) se necessário

### 2. Pipeline de Ingestão
- Criar script para processar PDFs/documentos
- Quebrar em chunks otimizados
- Gerar embeddings em lote
- Indexar por tags/metadados

### 3. Melhorias na IA
- Ajustar prompts por setor
- Implementar re-ranking de resultados
- Adicionar filtros por data/relevância
- Métricas de qualidade das respostas

### 4. Interface Admin
- Dashboard para gerenciar conhecimento
- Upload de documentos por setor
- Visualização de métricas RAG
- Configuração de prompts

## 📊 Monitoramento

### Métricas Importantes
- **Taxa de citação**: % respostas com citações
- **Qualidade das respostas**: feedback dos usuários
- **Uso de memória**: personalização efetiva
- **Performance**: tempo de resposta RAG

### Logs Estruturados
```javascript
console.log({
  event: 'rag_query',
  companyId,
  userId,
  contextMode,
  sector,
  citationsFound: citations.length,
  memoriesUsed: memories.length,
  responseTime: Date.now() - startTime
});
```

## 🔒 Segurança

### Multi-tenancy
- Todas as queries filtradas por `company_id`
- Headers `x-company-id` obrigatórios
- Isolamento completo entre empresas

### Controle de Acesso
- Validação de usuário por empresa
- Contexto setorial respeitado
- Memórias privadas por usuário

Agora sua API está pronta para ser uma Super IA contextual que aprende com cada empresa e usuário! 🚀
