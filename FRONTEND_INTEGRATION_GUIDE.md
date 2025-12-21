# 🚀 CondoGov AdminAssistant - Guia de Integração Frontend

## 📋 Visão Geral

Esta documentação fornece tudo que você precisa para integrar o frontend React com a API CondoGov AdminAssistant que possui **RAG (Retrieval-Augmented Generation)**, **memória inteligente** e **contexto setorial**.

## 🔗 Base URL e Headers

### Base URL
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
```

### Headers Obrigatórios
```typescript
const headers = {
  'Content-Type': 'application/json',
  'x-company-id': 'sua-empresa-uuid',    // UUID da empresa ativa
  'x-user-id': 'user-123'                // ID do usuário logado
};
```

## 📡 Endpoints Disponíveis

### 1. **Modelos de IA**

#### GET `/api/ai/models`
Lista todos os modelos disponíveis.

```typescript
interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'anthropic' | 'x-ai';
  description: string;
  capabilities: string[];
  maxTokens: number;
}

// Exemplo de uso
const getModels = async (): Promise<AIModel[]> => {
  const response = await fetch(`${API_BASE_URL}/api/ai/models`);
  const data = await response.json();
  return data.success ? data.data : [];
};
```

#### GET `/api/ai/models/:modelId`
Detalhes de um modelo específico.

```typescript
const getModel = async (modelId: string): Promise<AIModel | null> => {
  const response = await fetch(`${API_BASE_URL}/api/ai/models/${modelId}`);
  const data = await response.json();
  return data.success ? data.data : null;
};
```

### 2. **Chat com IA (RAG)**

#### POST `/api/ai/chat`
Envia mensagem para IA com contexto RAG.

```typescript
interface ChatRequest {
  message: string;
  model: string;                                    // Default: "openai/gpt-5-chat"
  userId: string;
  sessionId?: string;                               // Opcional
  contextMode: 'general' | 'sector';                // Default: "general"
  sector?: string;                                  // Obrigatório se contextMode = "sector"
  includeImages?: boolean;
  imageUrls?: string[];
}

interface ChatResponse {
  success: boolean;
  data: {
    response: {
      message: string;
      model: string;
      tokens: number;
      sessionId: string;
      messageId: string;
      timestamp: string;
      citations?: KnowledgeCitation[];               // Fontes usadas
      memoryUsed?: UserMemory[];                     // Memórias aplicadas
    };
    session: ChatSession;
    context: {
      mode: 'general' | 'sector';
      sector?: string;
      company: string;
    };
  };
}

// Exemplo de uso
const sendMessage = async (request: ChatRequest): Promise<ChatResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });
  
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Erro na IA');
  return data;
};
```

#### POST `/api/ai/analyze`
Análise inteligente de dados específicos.

```typescript
interface AnalyzeRequest {
  data: any;                                        // Dados para análise
  analysisType: 'performance' | 'financial' | 'alerts' | 'optimization';
  model?: string;                                   // Default: "openai/gpt-5-chat"
  userId: string;
  contextMode?: 'general' | 'sector';
  sector?: string;
}

const analyzeData = async (request: AnalyzeRequest): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/api/ai/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });
  
  return response.json();
};
```

#### GET `/api/ai/suggestions`
Obter sugestões rápidas por categoria.

```typescript
const getSuggestions = async (category?: string): Promise<QuickSuggestion[]> => {
  const url = category 
    ? `${API_BASE_URL}/api/ai/suggestions?category=${category}`
    : `${API_BASE_URL}/api/ai/suggestions`;
    
  const response = await fetch(url);
  const data = await response.json();
  return data.success ? data.data : [];
};
```

### 3. **Gerenciamento de Sessões**

#### POST `/api/chat/sessions`
Criar nova sessão de chat.

```typescript
interface CreateSessionRequest {
  userId: string;
  model: string;
  contextMode?: 'general' | 'sector';
  sector?: string;
}

const createSession = async (request: CreateSessionRequest): Promise<ChatSession> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });
  
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');
  return data.data;
};
```

#### GET `/api/chat/sessions/:userId`
Listar sessões do usuário.

```typescript
const getUserSessions = async (userId: string): Promise<ChatSession[]> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${userId}`, {
    headers
  });
  
  const data = await response.json();
  return data.success ? data.data : [];
};
```

#### GET `/api/chat/sessions/:sessionId/details`
Obter detalhes completos de uma sessão.

```typescript
const getSessionDetails = async (sessionId: string): Promise<ChatSession | null> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/details`);
  const data = await response.json();
  return data.success ? data.data : null;
};
```

#### DELETE `/api/chat/sessions/:sessionId`
Deletar sessão.

```typescript
const deleteSession = async (sessionId: string): Promise<boolean> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}`, {
    method: 'DELETE',
    headers
  });
  
  const data = await response.json();
  return data.success;
};
```

#### POST `/api/chat/sessions/:sessionId/clear`
Limpar mensagens da sessão.

```typescript
const clearSession = async (sessionId: string): Promise<ChatSession | null> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/clear`, {
    method: 'POST',
    headers
  });
  
  const data = await response.json();
  return data.success ? data.data : null;
};
```

#### PUT `/api/chat/sessions/:sessionId/messages/:messageId`
Atualizar mensagem (favoritar, etc).

```typescript
const updateMessage = async (
  sessionId: string, 
  messageId: string, 
  updates: { favorite?: boolean; tokens?: number }
): Promise<ChatMessage | null> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/messages/${messageId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates)
  });
  
  const data = await response.json();
  return data.success ? data.data : null;
};
```

#### GET `/api/chat/sessions/:sessionId/export`
Exportar sessão como JSON.

```typescript
const exportSession = async (sessionId: string): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/export`);
  return response.text(); // Retorna JSON como string
};

// Para fazer download
const downloadSession = async (sessionId: string) => {
  const jsonData = await exportSession(sessionId);
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-session-${sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

#### GET `/api/chat/sessions/:sessionId/stats`
Estatísticas da sessão.

```typescript
interface SessionStats {
  messageCount: number;
  totalTokens: number;
  duration: number; // em millisegundos
}

const getSessionStats = async (sessionId: string): Promise<SessionStats | null> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/sessions/${sessionId}/stats`);
  const data = await response.json();
  return data.success ? data.data : null;
};
```

#### GET `/api/chat/search/:userId?q=termo`
Buscar sessões por conteúdo.

```typescript
const searchSessions = async (userId: string, query: string): Promise<ChatSession[]> => {
  const response = await fetch(`${API_BASE_URL}/api/chat/search/${userId}?q=${encodeURIComponent(query)}`, {
    headers
  });
  
  const data = await response.json();
  return data.success ? data.data : [];
};
```

## 🎯 Tipos TypeScript

```typescript
// Copie estes tipos para seu projeto
interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  contextMode: 'general' | 'sector';
  sector?: string;
  companyId: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  userId: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
  timestamp: string; // ISO string
  model?: string;
  tokens?: number;
  favorite?: boolean;
}

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface KnowledgeCitation {
  chunkId: string;
  sourceId: string;
  sector: string;
  content: string;
  score: number;
  tags?: string[];
}

interface UserMemory {
  id: string;
  companyId: string;
  userId: string;
  memoryType: 'preference' | 'context' | 'rule' | 'fact';
  content: string;
  confidence: number;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

interface QuickSuggestion {
  id: string;
  category: 'performance' | 'financial' | 'maintenance' | 'legal' | 'resident';
  title: string;
  prompt: string;
  icon: string;
}
```

## 🎨 Hook React Personalizado

```typescript
// hooks/useChat.ts
import { useState, useCallback } from 'react';

interface UseChatOptions {
  companyId: string;
  userId: string;
  defaultModel?: string;
}

export const useChat = ({ companyId, userId, defaultModel = 'openai/gpt-5-chat' }: UseChatOptions) => {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'x-company-id': companyId,
    'x-user-id': userId
  };

  const startSession = useCallback(async (
    contextMode: 'general' | 'sector' = 'general',
    sector?: string
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const session = await createSession({
        userId,
        model: defaultModel,
        contextMode,
        sector
      });
      
      setCurrentSession(session);
      return session;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar sessão';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId, defaultModel]);

  const sendMessage = useCallback(async (
    message: string,
    contextMode: 'general' | 'sector' = 'general',
    sector?: string
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      // Criar sessão se não existir
      let session = currentSession;
      if (!session) {
        session = await startSession(contextMode, sector);
      }

      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          model: defaultModel,
          userId,
          sessionId: session.id,
          contextMode,
          sector
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro na IA');

      setCurrentSession(data.data.session);
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, defaultModel, userId, headers]);

  const sendMessageWithImages = useCallback(async (
    message: string,
    imageUrls: string[],
    contextMode: 'general' | 'sector' = 'general',
    sector?: string
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      let session = currentSession;
      if (!session) {
        session = await startSession(contextMode, sector);
      }

      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          model: defaultModel,
          userId,
          sessionId: session.id,
          contextMode,
          sector,
          includeImages: true,
          imageUrls
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro na IA');

      setCurrentSession(data.data.session);
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, defaultModel, userId, headers]);

  const toggleFavorite = useCallback(async (messageId: string, favorite: boolean) => {
    if (!currentSession) return;

    try {
      await updateMessage(currentSession.id, messageId, { favorite });
      
      // Atualizar estado local
      setCurrentSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.map(msg => 
            msg.id === messageId ? { ...msg, favorite } : msg
          )
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar mensagem');
    }
  }, [currentSession]);

  const clearSession = useCallback(async () => {
    if (!currentSession) return;

    try {
      const clearedSession = await clearSession(currentSession.id);
      setCurrentSession(clearedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar sessão');
    }
  }, [currentSession]);

  return {
    currentSession,
    isLoading,
    error,
    startSession,
    sendMessage,
    sendMessageWithImages,
    toggleFavorite,
    clearSession,
    setCurrentSession
  };
};
```

## 🎨 Componente de Exemplo

```tsx
// components/ChatInterface.tsx
import React, { useState } from 'react';
import { useChat } from '../hooks/useChat';

interface ChatInterfaceProps {
  companyId: string;
  userId: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ companyId, userId }) => {
  const { currentSession, isLoading, error, sendMessage } = useChat({ companyId, userId });
  const [message, setMessage] = useState('');
  const [contextMode, setContextMode] = useState<'general' | 'sector'>('general');
  const [sector, setSector] = useState('');

  const sectors = [
    'Dashboard', 'Clientes', 'Comunicação', 'Pesquisas', 'Projetos',
    'Processos', 'Documentos', 'Ferramentas', 'Gestão de Tarefas',
    'CRM Inteligente', 'RH Unificado', 'Compras Inteligentes',
    'Reuniões CondoGov', 'Operacional'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await sendMessage(message, contextMode, sector);
      setMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  };

  return (
    <div className="chat-interface">
      {/* Seletor de Contexto */}
      <div className="context-selector">
        <select 
          value={contextMode} 
          onChange={(e) => setContextMode(e.target.value as 'general' | 'sector')}
        >
          <option value="general">Contexto Geral</option>
          <option value="sector">Contexto Setorial</option>
        </select>

        {contextMode === 'sector' && (
          <select value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Selecione o Setor</option>
            {sectors.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* Mensagens */}
      <div className="messages">
        {currentSession?.messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="content">{msg.content as string}</div>
            <div className="meta">
              {msg.model} • {new Date(msg.timestamp).toLocaleTimeString()}
              {msg.tokens && ` • ${msg.tokens} tokens`}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="message-form">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite sua mensagem..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !message.trim()}>
          {isLoading ? 'Enviando...' : 'Enviar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
    </div>
  );
};
```

## 🔧 Configuração no Projeto

### 1. Variáveis de Ambiente (.env.local)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### 2. Instalação de Dependências
```bash
npm install # ou yarn install
# Não precisa de dependências extras, apenas fetch nativo
```

### 3. Uso Básico
```tsx
import { ChatInterface } from './components/ChatInterface';

function App() {
  const companyId = 'sua-empresa-uuid'; // Pegar do contexto/auth
  const userId = 'user-123';            // Pegar do usuário logado

  return (
    <div>
      <ChatInterface companyId={companyId} userId={userId} />
    </div>
  );
}
```

## 🎯 Funcionalidades Principais

### ✅ **Chat Inteligente**
- Contexto geral ou setorial
- Modelo GPT‑5 por padrão
- Suporte a imagens
- Citações de fontes
- Memória do usuário

### ✅ **Gestão de Sessões**
- Criar/listar/deletar sessões
- Histórico persistente
- Busca por conteúdo
- Exportar conversas
- Estatísticas detalhadas

### ✅ **Personalização**
- Memória por usuário
- Contexto por empresa
- Setores específicos
- Sugestões rápidas

### ✅ **Análises**
- Dados estruturados
- Múltiplos tipos de análise
- Respostas fundamentadas
- Performance/Financial/Alerts/Optimization

## 🚨 Tratamento de Erros

```typescript
// Sempre verificar success nas respostas
const handleApiCall = async () => {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Erro na API');
    }
    
    return data.data;
  } catch (error) {
    console.error('API Error:', error);
    // Mostrar erro amigável para o usuário
    setError(error.message);
  }
};
```

## 🎉 Pronto!

Agora você tem tudo para integrar o frontend com a API RAG! A IA vai:

- 🧠 **Responder com conhecimento** da sua empresa
- 👤 **Personalizar** baseado no histórico do usuário  
- 🏢 **Focar no setor** específico quando necessário
- 📚 **Citar fontes** reais dos dados
- 💾 **Lembrar** das conversas anteriores

Precisa de ajuda com alguma implementação específica?
