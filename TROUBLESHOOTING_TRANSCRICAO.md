# Troubleshooting: Erro 401 "User not found" na Transcrição

## Problema

Ao tentar transcrever áudio, você recebe o erro:
```
error: 401 User not found.
```

## Causa

O erro ocorre porque:

1. **Gemini via OpenRouter falha primeiro** - A API key do OpenRouter pode estar:
   - Não configurada
   - Inválida/expirada
   - Sem créditos suficientes
   - Sem permissão para usar o modelo `google/gemini-2.5-pro`

2. **Fallback para Whisper também falha** - Quando o Gemini falha, o sistema tenta usar Whisper como fallback, mas:
   - A variável `OPENAI_API_KEY` pode não estar configurada
   - A API key pode estar inválida/expirada
   - A API key pode não ter permissão para usar Whisper

## Solução

### 1. Verificar Variáveis de Ambiente

Certifique-se de que seu arquivo `.env` contém:

```env
# Obrigatório para Gemini e outros modelos via OpenRouter
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Opcional mas recomendado para fallback Whisper
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
```

### 2. Obter/Validar API Keys

#### OpenRouter API Key:
1. Acesse https://openrouter.ai/
2. Crie uma conta ou faça login
3. Vá em "Keys" no dashboard
4. Crie uma nova API key
5. Copie a chave (formato: `sk-or-v1-...`)
6. Adicione ao `.env` como `OPENROUTER_API_KEY`

#### OpenAI API Key (para fallback):
1. Acesse https://platform.openai.com/
2. Vá em "API keys"
3. Crie uma nova secret key
4. Copie a chave (formato: `sk-...`)
5. Adicione ao `.env` como `OPENAI_API_KEY`

**Importante:** A OpenAI API key precisa ter créditos e permissão para usar o modelo Whisper.

### 3. Verificar Créditos

- **OpenRouter**: Verifique se há créditos suficientes no dashboard
- **OpenAI**: Verifique se há créditos na conta (Whisper é pago por minuto)

### 4. Testar Configuração

Após configurar as variáveis, reinicie o servidor e teste novamente a transcrição.

## Melhorias Implementadas

O código foi atualizado para:

1. ✅ **Mensagens de erro mais claras** - Agora mostra qual serviço falhou e por quê
2. ✅ **Validação de API keys** - Verifica se as chaves estão configuradas antes de usar
3. ✅ **Tratamento de erros melhorado** - Captura códigos de erro específicos (401, etc.)
4. ✅ **Logs informativos** - Mostra quando está tentando fallback e por quê falhou

## Exemplo de Erro Melhorado

Antes:
```
error: 401 User not found.
```

Agora:
```
Gemini transcription failed (401): User not found.
Tentando fallback para Whisper...
Whisper fallback também falhou (401): User not found.
Error: Transcrição falhou em ambos os serviços. 
Gemini: 401 - User not found. 
Whisper: 401 - User not found. 
Verifique se OPENROUTER_API_KEY e OPENAI_API_KEY estão configuradas corretamente.
```

## Próximos Passos

1. Configure as variáveis de ambiente conforme acima
2. Reinicie o servidor
3. Teste novamente a transcrição
4. Se o erro persistir, verifique:
   - Se as API keys estão corretas (sem espaços extras)
   - Se há créditos nas contas
   - Se os modelos estão disponíveis (verifique status em openrouter.ai)

## Alternativas

Se você não quiser usar Whisper como fallback, pode:
- Remover a variável `OPENAI_API_KEY` do `.env`
- O sistema tentará apenas Gemini via OpenRouter
- Se Gemini falhar, retornará erro claro indicando que precisa configurar as chaves

