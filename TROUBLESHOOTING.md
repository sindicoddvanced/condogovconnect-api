# 🔧 CondoGov AdminAssistant API - Troubleshooting

## 🚨 Problemas Comuns e Soluções

### **1. Erro de CORS**

#### **Problema:**
```
Access to fetch at 'http://localhost:3000/api/chat/sessions' from origin 'http://localhost:8080' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

#### **✅ Solução:**
O CORS já está configurado para `localhost:8080`, mas você precisa:

1. **Reiniciar o servidor** após mudanças:
```bash
# Parar o servidor (Ctrl+C)
bun run dev
```

2. **Verificar headers customizados** estão sendo enviados:
```typescript
// Frontend - certifique-se de enviar os headers obrigatórios
const headers = {
  'Content-Type': 'application/json',
  'x-company-id': 'sua-empresa-uuid',  // ⚠️ OBRIGATÓRIO
  'x-user-id': 'user-123'              // ⚠️ OBRIGATÓRIO
};
```

3. **Origens permitidas** (já configurado):
- `http://localhost:3000`
- `http://localhost:5173` 
- `http://localhost:8080` ✅

4. **Headers permitidos** (já configurado):
- `Content-Type`
- `Authorization`
- `x-company-id` ✅
- `x-user-id` ✅

### **2. Headers Obrigatórios Ausentes**

#### **Problema:**
```json
{
  "success": false,
  "error": "Header x-company-id é obrigatório"
}
```

#### **✅ Solução:**
Sempre enviar os headers obrigatórios:

```typescript
// ✅ Correto
const response = await fetch(`${API_URL}/api/chat/sessions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'sua-empresa-uuid',
    'x-user-id': 'user-123'
  },
  body: JSON.stringify({
    userId: 'user-123',
    model: 'openai/gpt-5-chat'
  })
});

// ❌ Incorreto - sem headers
const response = await fetch(`${API_URL}/api/chat/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user-123', model: 'openai/gpt-5-chat' })
});
```

### **3. Contexto Setorial Inválido**

#### **Problema:**
```json
{
  "success": false,
  "error": "Campo 'sector' é obrigatório quando contextMode='sector'"
}
```

#### **✅ Solução:**
Quando usar `contextMode: "sector"`, sempre incluir o setor:

```typescript
// ✅ Correto - contexto setorial
{
  "message": "Analise os projetos",
  "contextMode": "sector",
  "sector": "Projetos"           // ⚠️ OBRIGATÓRIO
}

// ✅ Correto - contexto geral
{
  "message": "Visão geral da empresa",
  "contextMode": "general"       // sector não necessário
}

// ❌ Incorreto
{
  "message": "Analise os projetos",
  "contextMode": "sector"        // ❌ Falta o campo 'sector'
}
```

#### **Setores Válidos:**
- Dashboard
- Clientes  
- Comunicação
- Pesquisas
- Projetos
- Processos
- Documentos
- Ferramentas
- Gestão de Tarefas
- CRM Inteligente
- RH Unificado
- Compras Inteligentes
- Reuniões CondoGov
- Operacional

### **4. Tabelas Não Criadas**

#### **Problema:**
A API funciona mas não salva dados no Supabase.

#### **✅ Solução:**
Execute os SQLs manualmente no Supabase Dashboard:

1. **Acesse:** [supabase.com/dashboard](https://supabase.com/dashboard)
2. **Projeto:** `dzfippnhokywoylasoiz`
3. **SQL Editor** → Cole `supabase_setup.sql` → **Run**
4. **SQL Editor** → Cole `supabase_documents_setup.sql` → **Run**

#### **Verificar se funcionou:**
```sql
-- Execute no SQL Editor para verificar
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('knowledge_sources', 'chat_sessions', 'documents')
ORDER BY table_name;
```

### **5. Chaves de API Inválidas**

#### **Problema:**
```
Failed to get AI response: Invalid API key
```

#### **✅ Solução:**
Verificar chaves no `.env`:

```bash
# Testar OpenRouter
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

# Testar OpenAI  
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models
```

### **6. Modelo Não Encontrado**

#### **Problema:**
```json
{
  "success": false,
  "error": "Model openai/gpt-5-chat not found"
}
```

#### **✅ Solução:**
Usar modelos disponíveis:

```typescript
// ✅ Modelos disponíveis
"openai/gpt-5-chat"        // GPT-5 (recomendado)
"openai/gpt-4.1"           // GPT-4.1
"google/gemini-2.5-pro"    // Gemini 2.5 Pro
"anthropic/claude-sonnet-4" // Claude Sonnet 4
"x-ai/grok-4"              // Grok 4

// Verificar modelos disponíveis
GET /api/ai/models
```

### **7. Upload de Áudio Falha**

#### **Problema:**
Erro ao fazer upload de arquivo de áudio.

#### **✅ Solução:**
Usar FormData corretamente:

```typescript
// ✅ Correto
const formData = new FormData();
formData.append('audioFile', audioFile);           // File object
formData.append('companyId', 'empresa-uuid');
formData.append('options', JSON.stringify({        // JSON string
  language: 'pt-BR',
  actionItemExtraction: true
}));

const response = await fetch(`${API_URL}/api/documents/transcribe-audio`, {
  method: 'POST',
  headers: {
    'x-company-id': 'empresa-uuid',
    'x-user-id': 'user-123'
    // ⚠️ NÃO incluir Content-Type para multipart
  },
  body: formData
});
```

### **8. Erro de Conectividade Supabase**

#### **Problema:**
```
Error executing Supabase query: Unable to connect
```

#### **✅ Solução:**
Isso é normal em desenvolvimento. A API funciona com fallbacks:

1. **Modo de desenvolvimento** - dados simulados
2. **Logs informativos** - não são erros críticos
3. **API funcional** - endpoints respondem normalmente

Para conectividade real:
- Execute os SQLs no Supabase Dashboard
- Configure `SUPABASE_SERVICE_ROLE_KEY` correto

## 🧪 Como Testar

### **1. Health Check**
```bash
curl http://localhost:3000/
# Deve retornar: {"success": true, "message": "API está funcionando!"}
```

### **2. Listar Modelos**
```bash
curl http://localhost:3000/api/ai/models
# Deve retornar lista de modelos disponíveis
```

### **3. Chat Básico**
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "x-company-id: test-uuid" \
  -H "x-user-id: user-123" \
  -d '{
    "message": "Olá",
    "model": "openai/gpt-5-chat",
    "userId": "user-123"
  }'
```

### **4. Criar Sessão**
```bash
curl -X POST http://localhost:3000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -H "x-company-id: test-uuid" \
  -H "x-user-id: user-123" \
  -d '{
    "userId": "user-123",
    "model": "openai/gpt-5-chat"
  }'
```

## 🔧 Configuração Frontend

### **Base URL Correta**
```typescript
// .env.local (Next.js)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

// .env (Vite)
VITE_API_BASE_URL=http://localhost:3000
```

### **Headers em Todas as Requisições**
```typescript
// Criar um interceptor ou função helper
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': getCurrentCompanyId(), // Função para pegar empresa ativa
      'x-user-id': getCurrentUserId(),       // Função para pegar usuário logado
      ...options.headers
    }
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Erro na API');
  return data.data;
};

// Uso
const sessions = await apiCall('/api/chat/sessions/user-123');
```

### **Tratamento de Erros**
```typescript
try {
  const result = await apiCall('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: 'Teste',
      model: 'openai/gpt-5-chat',
      userId: 'user-123'
    })
  });
  
  console.log('Sucesso:', result);
} catch (error) {
  console.error('Erro:', error.message);
  
  // Mostrar erro amigável para o usuário
  if (error.message.includes('company-id')) {
    alert('Erro de configuração: empresa não identificada');
  } else if (error.message.includes('API key')) {
    alert('Erro de configuração: chave de API inválida');
  } else {
    alert('Erro temporário, tente novamente');
  }
}
```

## ✅ Checklist de Verificação

### **API (Backend)**
- [ ] `.env` configurado com chaves válidas
- [ ] Servidor rodando em `http://localhost:3000`
- [ ] Health check funcionando: `GET /`
- [ ] CORS configurado para sua origem frontend
- [ ] Headers `x-company-id` e `x-user-id` permitidos

### **Frontend**
- [ ] Base URL configurada corretamente
- [ ] Headers obrigatórios em todas as requisições
- [ ] Tratamento de erros implementado
- [ ] Campos obrigatórios validados antes do envio

### **Supabase (Opcional)**
- [ ] SQLs executados no Dashboard
- [ ] Service Role Key configurada
- [ ] Tabelas criadas e verificadas

## 🎉 Resultado

Com essas correções, sua integração frontend deve funcionar perfeitamente! O erro de CORS foi resolvido adicionando os headers customizados `x-company-id` e `x-user-id` aos headers permitidos.

**Reinicie o servidor e teste novamente!** 🚀


