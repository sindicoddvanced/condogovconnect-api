# CondoGov AdminAssistant API

Uma API completa para integração de múltiplos modelos de IA especializados em gestão de condomínios, usando o OpenRouter para acesso aos melhores modelos disponíveis.

## 🎯 Funcionalidades

### Chat Inteligente

- Interface de chat em tempo real com múltiplos modelos de IA
- Suporte a análise de imagens (modelos compatíveis)
- Histórico de conversas persistente
- Timestamps e controle de tokens

### Modelos de IA Suportados

- **GPT-5** (OpenAI) - Modelo multimodal de última geração, excelente em raciocínio e análise
- **GPT-4.1** (OpenAI) - Análises complexas e raciocínio avançado
- **Gemini 2.5 Pro** (Google) - Análises multimodais com suporte a imagens
- **Claude Sonnet 4** (Anthropic) - Foco em segurança e precisão
- **Grok 4** (x-ai) - Modelo open source eficiente

### Análises Inteligentes

- **Performance de Projetos**: Taxa de conclusão, projetos atrasados
- **Alertas Críticos**: Questões urgentes e prioritárias
- **Previsões Financeiras**: Receita, faturamento, orçamentos
- **Otimização de Processos**: Sugestões de melhorias

### Sugestões Rápidas

- Templates predefinidos por categoria
- Ícones visuais para cada tipo de análise
- Categorias: Performance, Financeiro, Manutenção, Legal, Moradores

## 🚀 Instalação

1. **Clone o repositório**

```bash
git clone <repository-url>
cd condogovconnect-api
```

2. **Instale as dependências**

```bash
bun install
```

3. **Configure as variáveis de ambiente**

```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. **Configure sua chave do OpenRouter**

- Acesse [OpenRouter.ai](https://openrouter.ai)
- Crie uma conta e obtenha sua API key
- Adicione a chave no arquivo `.env`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## 🏃‍♂️ Execução

### Desenvolvimento

```bash
bun run dev
```

### Produção

```bash
bun run start
```

A API estará disponível em `http://localhost:3000`

## 📚 Documentação da API

### Endpoints Principais

#### Modelos de IA

- `GET /api/ai/models` - Listar modelos disponíveis
- `GET /api/ai/models/:modelId` - Detalhes de um modelo

#### Chat

- `POST /api/ai/chat` - Enviar mensagem para IA
- `POST /api/ai/analyze` - Análise inteligente de dados
- `GET /api/ai/suggestions` - Obter sugestões rápidas

#### Sessões de Chat

- `GET /api/chat/sessions/:userId` - Listar sessões do usuário
- `POST /api/chat/sessions` - Criar nova sessão
- `GET /api/chat/sessions/:sessionId/details` - Detalhes da sessão
- `DELETE /api/chat/sessions/:sessionId` - Deletar sessão
- `POST /api/chat/sessions/:sessionId/clear` - Limpar mensagens
- `GET /api/chat/sessions/:sessionId/export` - Exportar sessão
- `GET /api/chat/sessions/:sessionId/stats` - Estatísticas

### Exemplos de Uso

#### 1. Enviar mensagem para IA

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Analise a situação financeira do condomínio",
    "model": "openai/gpt-5-chat",
    "userId": "user123"
  }'
```

#### 2. Análise de dados do condomínio

```bash
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "revenue": 50000,
      "expenses": 45000,
      "projects": [
        {
          "name": "Reforma Piscina",
          "status": "in_progress",
          "completion": 75
        }
      ]
    },
    "analysisType": "financial",
    "userId": "user123"
  }'
```

#### 3. Análise com imagens (GPT-5 ou Gemini)

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "O que há nesta imagem?",
    "model": "openai/gpt-5-chat",
    "userId": "user123",
    "includeImages": true,
    "imageUrls": ["https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"]
  }'
```

#### 4. Obter sugestões rápidas

```bash
curl http://localhost:3000/api/ai/suggestions?category=financial
```

## 🔧 Estrutura do Projeto

```
src/
├── types/          # Definições TypeScript
│   └── ai.ts       # Tipos para IA e chat
├── services/       # Lógica de negócio
│   ├── aiService.ts    # Integração com OpenRouter
│   └── chatService.ts  # Gerenciamento de sessões
├── routes/         # Rotas da API
│   ├── ai.ts       # Endpoints de IA
│   └── chat.ts     # Endpoints de chat
└── index.ts        # Aplicação principal
```

## 🌟 Recursos Avançados

### Análises Inteligentes

O sistema oferece 4 tipos de análises especializadas:

1. **Performance**: Análise de projetos e eficiência operacional
2. **Financial**: Previsões e análises financeiras
3. **Alerts**: Priorização de alertas críticos
4. **Optimization**: Sugestões de otimização de processos

### Suporte Multimodal

- Análise de imagens com Gemini 2.5 Pro
- Suporte a múltiplos tipos de conteúdo
- Validação automática de compatibilidade

### Gerenciamento de Sessões

- Histórico persistente de conversas
- Busca em sessões e mensagens
- Exportação de dados
- Estatísticas detalhadas

## 🔒 Segurança

- Validação de entrada com Zod
- Headers de segurança configurados
- Tratamento de erros robusto
- CORS configurado para domínios específicos

## 📈 Monitoramento

- Logs estruturados com timestamps
- Contagem de tokens por mensagem
- Estatísticas de uso por sessão
- Health checks automáticos

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a licença MIT.

## 🆘 Suporte

Para suporte e dúvidas:

- Acesse a documentação em: `http://localhost:3000/docs`
- Health check: `http://localhost:3000/`
