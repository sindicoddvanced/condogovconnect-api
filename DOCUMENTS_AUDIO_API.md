# 🎙️ CondoGov AdminAssistant - API de Documentos e Áudio

## ✅ Funcionalidades Implementadas

### 🧠 **Geração de Documentos com IA**
- **GPT-5** para geração de conteúdo
- **RAG contextual** por setor e empresa
- **Templates personalizáveis**
- **Export PDF/DOCX**
- **Citações de fontes**

### 🎙️ **Transcrição de Áudio Inteligente**
- **Gemini 2.5 Pro** para transcrição (melhor qualidade)
- **Whisper fallback** se Gemini falhar
- **Identificação de speakers**
- **Extração de ações/tarefas**
- **Análise de sentimento**
- **Geração automática de pauta**

### 📋 **Resumo Inteligente de Atas**
- **Múltiplos tipos** de resumo (executivo, detalhado, ações, decisões)
- **Contexto RAG** da empresa
- **Extração estruturada** de informações
- **Próximos passos** automáticos

## 📡 Endpoints Implementados

### 1. **POST `/api/documents/generate`** - Gerar Documento com IA

#### Request
```typescript
{
  "prompt": "Gere um contrato de manutenção para elevadores",
  "documentType": "pdf",                    // "pdf" | "docx"
  "templateId": "template-123",             // Opcional
  "companyId": "empresa-uuid",
  "metadata": {
    "sector": "Documentos",
    "category": "contrato",
    "tags": ["manutenção", "elevador"]
  }
}
```

#### Response
```typescript
{
  "success": true,
  "data": {
    "documentId": "doc_123",
    "title": "Contrato de Manutenção de Elevadores",
    "content": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS...",
    "fileUrl": "https://supabase.co/storage/.../contrato.pdf",
    "fileName": "contrato-manutencao-elevadores.pdf",
    "fileSize": 245760,
    "usage": {
      "promptTokens": 1234,
      "completionTokens": 2345,
      "totalTokens": 3579
    },
    "citations": [
      {
        "sector": "Documentos",
        "content": "Modelos de contrato da empresa...",
        "score": 0.85
      }
    ]
  }
}
```

### 2. **POST `/api/documents/transcribe-audio`** - Transcrever Áudio

#### Request (Multipart Form)
```typescript
// Form Data
audioFile: File                             // Arquivo de áudio
companyId: string                           // UUID da empresa
meetingId?: string                          // ID da reunião (opcional)
options: {
  "language": "pt-BR",                      // "pt-BR" | "en-US" | "es-ES"
  "speakerIdentification": true,
  "actionItemExtraction": true,
  "agendaGeneration": true,
  "keyPointsExtraction": true,
  "sentimentAnalysis": false,
  "autoTranslation": false
}
```

#### Request (JSON com URL)
```typescript
{
  "audioUrl": "https://example.com/audio.mp3",
  "companyId": "empresa-uuid",
  "meetingId": "reuniao-123",
  "options": {
    "language": "pt-BR",
    "speakerIdentification": true,
    "actionItemExtraction": true,
    "agendaGeneration": true,
    "keyPointsExtraction": true,
    "sentimentAnalysis": true
  }
}
```

#### Response
```typescript
{
  "success": true,
  "data": {
    "processingId": "proc_123",
    "transcription": {
      "text": "Boa tarde, vamos iniciar nossa reunião...",
      "confidence": 0.95,
      "language": "pt-BR",
      "duration": 1800                      // segundos
    },
    "speakers": [                           // Se speakerIdentification = true
      {
        "id": "speaker_1",
        "name": "Participante 1",
        "segments": [
          {
            "start": 0,
            "end": 15,
            "text": "Boa tarde, vamos iniciar nossa reunião"
          }
        ]
      }
    ],
    "analysis": {
      "actionItems": [                      // Se actionItemExtraction = true
        {
          "description": "Solicitar orçamento para reforma da piscina",
          "assignee": "João Silva",
          "dueDate": "2024-02-15",
          "priority": "high"
        }
      ],
      "keyPoints": [                        // Se keyPointsExtraction = true
        "Aprovação do orçamento 2024",
        "Discussão sobre reforma da área comum",
        "Definição de cronograma de manutenção"
      ],
      "agenda": [                           // Se agendaGeneration = true
        {
          "title": "Aprovação de Orçamento",
          "description": "Discussão e votação do orçamento anual",
          "presenter": "Administrador"
        }
      ],
      "sentiment": {                        // Se sentimentAnalysis = true
        "overall": "positive",
        "byTopic": [
          {
            "topic": "orçamento",
            "sentiment": "positive",
            "confidence": 0.8
          }
        ]
      }
    },
    "usage": {
      "audioMinutes": 30,
      "transcriptionTokens": 2500,
      "analysisTokens": 1200,
      "totalTokens": 3700
    }
  }
}
```

### 3. **POST `/api/documents/summarize-minute`** - Resumir Ata

#### Request
```typescript
{
  "minuteId": "ata-123",
  "summaryType": "executive",               // "executive" | "detailed" | "action_items" | "decisions"
  "companyId": "empresa-uuid"
}
```

#### Response
```typescript
{
  "success": true,
  "data": {
    "summary": "Resumo executivo da reunião realizada...",
    "highlights": [
      "Orçamento 2024 aprovado por unanimidade",
      "Reforma da piscina adiada para próximo semestre",
      "Nova política de uso da área comum definida"
    ],
    "actionItems": [
      {
        "description": "Contratar empresa de manutenção",
        "assignee": "João Silva",
        "dueDate": "2024-02-20",
        "priority": "high"
      }
    ],
    "decisions": [
      {
        "item": "Orçamento 2024",
        "decision": "Aprovado por unanimidade",
        "approved": true
      }
    ],
    "nextSteps": [
      "Implementar novo cronograma de manutenção",
      "Comunicar decisões aos moradores",
      "Agendar próxima reunião para março"
    ],
    "usage": {
      "promptTokens": 1500,
      "completionTokens": 800,
      "totalTokens": 2300
    }
  }
}
```

### 4. **GET `/api/documents/processing/:processingId`** - Status do Processamento

#### Response
```typescript
{
  "success": true,
  "data": {
    "id": "proc_123",
    "status": "completed",                  // "processing" | "completed" | "failed"
    "progress": 100,                        // 0-100
    "result": {
      "transcription": "Texto completo...",
      "analysis": {...},
      "fileUrl": "https://..."
    },
    "error": null
  }
}
```

## 🎯 Como usar no Frontend

### **Headers Obrigatórios**
```typescript
const headers = {
  'Content-Type': 'application/json',       // ou multipart/form-data para upload
  'x-company-id': 'sua-empresa-uuid',
  'x-user-id': 'user-123'
};
```

### **1. Gerar Documento**
```typescript
const generateDocument = async (prompt: string, type: 'pdf' | 'docx') => {
  const response = await fetch(`${API_URL}/api/documents/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      documentType: type,
      companyId: 'empresa-uuid',
      metadata: {
        sector: 'Documentos',
        category: 'contrato',
        tags: ['automático', 'ia']
      }
    })
  });
  
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  
  // data.data.fileUrl = URL do documento gerado
  // data.data.citations = fontes utilizadas
  return data.data;
};
```

### **2. Transcrever Áudio (Upload)**
```typescript
const transcribeAudio = async (audioFile: File, meetingId?: string) => {
  const formData = new FormData();
  formData.append('audioFile', audioFile);
  formData.append('companyId', 'empresa-uuid');
  if (meetingId) formData.append('meetingId', meetingId);
  formData.append('options', JSON.stringify({
    language: 'pt-BR',
    actionItemExtraction: true,
    agendaGeneration: true,
    keyPointsExtraction: true,
    speakerIdentification: true
  }));

  const response = await fetch(`${API_URL}/api/documents/transcribe-audio`, {
    method: 'POST',
    headers: {
      'x-company-id': 'empresa-uuid',
      'x-user-id': 'user-123'
    },
    body: formData
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  
  return data.data;
};
```

### **3. Transcrever Áudio (URL)**
```typescript
const transcribeAudioFromUrl = async (audioUrl: string) => {
  const response = await fetch(`${API_URL}/api/documents/transcribe-audio`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audioUrl,
      companyId: 'empresa-uuid',
      options: {
        language: 'pt-BR',
        actionItemExtraction: true,
        keyPointsExtraction: true
      }
    })
  });

  return response.json();
};
```

### **4. Resumir Ata**
```typescript
const summarizeMinute = async (minuteId: string, type: 'executive' | 'detailed') => {
  const response = await fetch(`${API_URL}/api/documents/summarize-minute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      minuteId,
      summaryType: type,
      companyId: 'empresa-uuid'
    })
  });

  const data = await response.json();
  return data.success ? data.data : null;
};
```

## 🎨 Hook React para Documentos

```typescript
// hooks/useDocuments.ts
import { useState } from 'react';

export const useDocuments = (companyId: string, userId: string) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDocument = async (prompt: string, type: 'pdf' | 'docx') => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/documents/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': companyId,
          'x-user-id': userId
        },
        body: JSON.stringify({
          prompt,
          documentType: type,
          companyId,
          metadata: {
            sector: 'Documentos',
            category: 'gerado-ia',
            tags: ['automático']
          }
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar documento');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const transcribeAudio = async (audioFile: File, options = {}) => {
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audioFile', audioFile);
      formData.append('companyId', companyId);
      formData.append('options', JSON.stringify({
        language: 'pt-BR',
        actionItemExtraction: true,
        agendaGeneration: true,
        keyPointsExtraction: true,
        ...options
      }));

      const response = await fetch(`${API_URL}/api/documents/transcribe-audio`, {
        method: 'POST',
        headers: {
          'x-company-id': companyId,
          'x-user-id': userId
        },
        body: formData
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      return data.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transcrever áudio');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    error,
    generateDocument,
    transcribeAudio
  };
};
```

## 🎯 Componente de Exemplo

```tsx
// components/DocumentGenerator.tsx
import React, { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';

export const DocumentGenerator = ({ companyId, userId }) => {
  const [prompt, setPrompt] = useState('');
  const [documentType, setDocumentType] = useState<'pdf' | 'docx'>('pdf');
  const { isProcessing, error, generateDocument } = useDocuments(companyId, userId);

  const handleGenerate = async () => {
    try {
      const result = await generateDocument(prompt, documentType);
      
      // Download automático
      const link = document.createElement('a');
      link.href = result.fileUrl;
      link.download = result.fileName;
      link.click();
      
      alert('Documento gerado com sucesso!');
    } catch (err) {
      console.error('Erro:', err);
    }
  };

  return (
    <div className="document-generator">
      <h3>🤖 Gerador de Documentos IA</h3>
      
      <div className="form-group">
        <label>Descrição do documento:</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Gere um contrato de manutenção para elevadores com cláusulas de responsabilidade..."
          rows={4}
        />
      </div>

      <div className="form-group">
        <label>Formato:</label>
        <select value={documentType} onChange={(e) => setDocumentType(e.target.value as 'pdf' | 'docx')}>
          <option value="pdf">PDF</option>
          <option value="docx">Word (DOCX)</option>
        </select>
      </div>

      <button 
        onClick={handleGenerate} 
        disabled={!prompt.trim() || isProcessing}
      >
        {isProcessing ? '🔄 Gerando...' : '📄 Gerar Documento'}
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );
};
```

```tsx
// components/AudioTranscriber.tsx
import React, { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';

export const AudioTranscriber = ({ companyId, userId, onTranscriptionComplete }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const { isProcessing, error, transcribeAudio } = useDocuments(companyId, userId);

  const handleTranscribe = async () => {
    if (!audioFile) return;

    try {
      const result = await transcribeAudio(audioFile, {
        speakerIdentification: true,
        actionItemExtraction: true,
        agendaGeneration: true
      });

      onTranscriptionComplete?.(result);
      alert('Transcrição concluída!');
    } catch (err) {
      console.error('Erro:', err);
    }
  };

  return (
    <div className="audio-transcriber">
      <h3>🎙️ Transcrição com Gemini 2.5 Pro</h3>
      
      <div className="form-group">
        <label>Arquivo de áudio:</label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
        />
      </div>

      {audioFile && (
        <div className="file-info">
          📁 {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
        </div>
      )}

      <button 
        onClick={handleTranscribe} 
        disabled={!audioFile || isProcessing}
      >
        {isProcessing ? '🔄 Transcrevendo...' : '🎙️ Transcrever com Gemini'}
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );
};
```

## 🔧 Setup Necessário

### **1. Executar SQL no Supabase**
```bash
# Copiar conteúdo de supabase_documents_setup.sql
# Colar no Supabase Dashboard > SQL Editor
# Executar
```

### **2. Configurar Variáveis**
```env
# Existing
OPENROUTER_API_KEY=sua_chave_openrouter
OPENAI_API_KEY=sua_chave_openai

# Supabase
SUPABASE_PROJECT_ID=dzfippnhokywoylasoiz
SUPABASE_URL=https://dzfippnhokywoylasoiz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **3. Instalar Dependências Adicionais**
```bash
# Para processamento de arquivos
npm install multer @types/multer

# Para geração de PDF (opcional)
npm install puppeteer html-pdf jspdf

# Para processamento de áudio (opcional)
npm install fluent-ffmpeg @types/fluent-ffmpeg
```

## 🚀 Funcionalidades Principais

### ✅ **Gemini 2.5 Pro para Transcrição**
- **Melhor qualidade** que Whisper para português
- **Suporte nativo a áudio** no Gemini
- **Fallback para Whisper** se Gemini falhar
- **Múltiplos formatos** de áudio suportados

### ✅ **Análise Inteligente**
- **Extração de ações** com responsáveis e prazos
- **Identificação de speakers** automática
- **Geração de pauta** baseada no conteúdo
- **Análise de sentimento** por tópicos
- **Pontos-chave** extraídos automaticamente

### ✅ **Geração de Documentos**
- **RAG contextual** usando conhecimento da empresa
- **Templates personalizáveis** por categoria
- **Múltiplos formatos** (PDF, DOCX)
- **Citações automáticas** das fontes
- **Linguagem jurídica** apropriada

### ✅ **Integração Completa**
- **Headers multi-tenancy** (x-company-id, x-user-id)
- **Contexto setorial** para documentos
- **Upload via multipart** ou URL
- **Processamento assíncrono** com status
- **Logs estruturados** para debugging

## 🎉 Resultado

Agora sua API tem **3 novos módulos poderosos**:

1. 🤖 **Gerador de Documentos IA** - GPT-5 + RAG
2. 🎙️ **Transcritor Inteligente** - Gemini 2.5 Pro + análises
3. 📋 **Resumidor de Atas** - Extração estruturada + insights

Tudo integrado com o sistema RAG existente e pronto para usar no frontend! 🚀

Precisa de ajuda com alguma implementação específica ou quer testar alguma funcionalidade?
