# Teste OpenRouter com URL de Vídeo/Áudio

## Como testar transcrição via OpenRouter diretamente

### 1. Obter URL do arquivo no Supabase Storage

Após fazer upload, você terá uma URL assinada do Supabase, por exemplo:
```
https://dzfippnhoymwoylasoiz.supabase.co/storage/v1/object/sign/audio-recordings/a0000000-0000-0000-0000-000000000001/video.mp4?token=eyJ...
```

### 2. Teste via cURL

#### Para ÁUDIO (usando input_audio com URL):
```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: http://localhost:3000" \
  -H "X-Title: CondoGov AdminAssistant" \
  -d '{
    "model": "google/gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Transcreva EXATAMENTE o que você ouve neste áudio. Retorne APENAS a transcrição literal, sem adicionar informações externas."
          },
          {
            "type": "input_audio",
            "input_audio": {
              "data": "BASE64_DO_ARQUIVO_AQUI",
              "format": "mp3"
            }
          }
        ]
      }
    ],
    "temperature": 0.1
  }'
```

#### Para VÍDEO (usando video_url):
```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: http://localhost:3000" \
  -H "X-Title: CondoGov AdminAssistant" \
  -d '{
    "model": "google/gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Transcreva EXATAMENTE o que você ouve neste vídeo. Retorne APENAS a transcrição literal, sem adicionar informações externas."
          },
          {
            "type": "video_url",
            "video_url": {
              "url": "https://dzfippnhoymwoylasoiz.supabase.co/storage/v1/object/sign/audio-recordings/a0000000-0000-0000-0000-000000000001/video.mp4?token=SEU_TOKEN_AQUI"
            }
          }
        ]
      }
    ],
    "temperature": 0.1
  }'
```

### 3. Teste via Postman

#### Configuração:
- **Method:** POST
- **URL:** `https://openrouter.ai/api/v1/chat/completions`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer SEU_OPENROUTER_API_KEY`
  - `HTTP-Referer: http://localhost:3000`
  - `X-Title: CondoGov AdminAssistant`

#### Body (JSON):
```json
{
  "model": "google/gemini-2.5-pro",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Transcreva EXATAMENTE o que você ouve neste vídeo. Retorne APENAS a transcrição literal."
        },
        {
          "type": "video_url",
          "video_url": {
            "url": "SUA_URL_DO_SUPABASE_AQUI"
          }
        }
      ]
    }
  ],
  "temperature": 0.1
}
```

### 4. Converter arquivo para Base64 (se necessário)

Se precisar usar `input_audio` com base64:

**Windows (PowerShell):**
```powershell
$bytes = [System.IO.File]::ReadAllBytes("caminho/para/video.mp4")
$base64 = [System.Convert]::ToBase64String($bytes)
$base64 | Out-File -Encoding utf8 base64.txt
```

**Linux/Mac:**
```bash
base64 -i video.mp4 -o base64.txt
```

**Node.js/Bun:**
```javascript
const fs = require('fs');
const buffer = fs.readFileSync('video.mp4');
const base64 = buffer.toString('base64');
console.log(base64);
```

### 5. Limitações Importantes

⚠️ **URLs Assinadas do Supabase:**
- URLs assinadas do Supabase podem não ser acessíveis pelo OpenRouter
- Se der erro 500, tente usar base64 em vez de URL

⚠️ **Tamanho do Arquivo:**
- Arquivos muito grandes (>20MB em base64) podem causar erro 500
- Recomendado: extrair áudio do vídeo primeiro (reduz de ~22MB para ~2-5MB)

⚠️ **Formato:**
- Para vídeo: use `video_url` com URL pública OU `input_audio` com base64
- Para áudio: use `input_audio` com base64 ou URL

### 6. Exemplo Completo com Base64

```bash
# 1. Converter arquivo para base64
base64 -i video.mp4 > video_base64.txt

# 2. Ler base64 e usar no curl
BASE64=$(cat video_base64.txt | tr -d '\n')

curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: http://localhost:3000" \
  -H "X-Title: CondoGov AdminAssistant" \
  -d "{
    \"model\": \"google/gemini-2.5-pro\",
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": [
          {
            \"type\": \"text\",
            \"text\": \"Transcreva EXATAMENTE o que você ouve neste áudio.\"
          },
          {
            \"type\": \"input_audio\",
            \"input_audio\": {
              \"data\": \"$BASE64\",
              \"format\": \"mp3\"
            }
          }
        ]
      }
    ],
    \"temperature\": 0.1
  }"
```

### 7. Verificar Resposta

A resposta deve ter esta estrutura:
```json
{
  "id": "...",
  "model": "google/gemini-2.5-pro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "TRANSCRIÇÃO AQUI..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": ...,
    "completion_tokens": ...,
    "total_tokens": ...
  }
}
```

### 8. Troubleshooting

**Erro 500 Internal Server Error:**
- Arquivo muito grande → Extrair áudio primeiro
- URL não acessível → Usar base64
- Formato não suportado → Verificar formato do arquivo

**Erro 401 Unauthorized:**
- Verificar se `OPENROUTER_API_KEY` está correto
- Verificar se a chave não expirou

**Erro 404 No endpoints found:**
- Verificar se o modelo está disponível: `google/gemini-2.5-pro`
- Alguns modelos podem não estar disponíveis no OpenRouter

