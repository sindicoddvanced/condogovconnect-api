# Rotas de Geração de Imagens e Apresentações

## 🎨 Geração de Imagens com IA

### POST `/api/documents/generate-image`

Gera imagens usando Gemini 3 Pro Image Preview via OpenRouter.

**Headers:**
- `x-company-id`: ID da empresa (obrigatório)
- `x-user-id`: ID do usuário (obrigatório)
- `Content-Type`: `application/json`

**Body:**
```json
{
  "companyId": "uuid-da-empresa",
  "prompt": "Generate a beautiful sunset over mountains",
  "model": "google/gemini-3-pro-image-preview", // opcional, padrão
  "size": "1024x1024", // opcional: "256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"
  "quality": "standard", // opcional: "standard" ou "hd"
  "style": "natural" // opcional: "vivid" ou "natural"
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "images": [
      {
        "imageUrl": "data:image/png;base64,iVBORw0KGgo...", // Base64 data URL
        "index": 1
      }
    ],
    "usage": {
      "promptTokens": 10,
      "completionTokens": 0,
      "totalTokens": 10
    }
  }
}
```

**Exemplo de Uso:**
```javascript
const response = await fetch('http://localhost:3000/api/documents/generate-image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  },
  body: JSON.stringify({
    companyId: 'seu-company-id',
    prompt: 'Um pôr do sol sobre montanhas com cores vibrantes'
  })
});

const data = await response.json();
if (data.success) {
  data.data.images.forEach(img => {
    console.log(`Imagem ${img.index}: ${img.imageUrl.substring(0, 50)}...`);
    // Use img.imageUrl diretamente em <img src={img.imageUrl} />
  });
}
```

---

## 📊 Geração de Apresentações/Documentos com Gamma

### POST `/api/documents/generate-gamma`

Gera apresentações, documentos, páginas web ou posts sociais usando a API do Gamma.

**Headers:**
- `x-company-id`: ID da empresa (obrigatório)
- `x-user-id`: ID do usuário (obrigatório)
- `Content-Type`: `application/json`

**Body:**
```json
{
  "companyId": "uuid-da-empresa",
  "inputText": "Quero apresentação sobre o limão não ser doce",
  "textMode": "generate", // "generate" | "condense" | "preserve"
  "format": "presentation", // "presentation" | "document" | "webpage" | "social"
  "themeId": "abc123", // opcional: ID do tema do Gamma
  "numCards": 10, // opcional: número de cards (1-75)
  "cardSplit": "auto", // opcional: "auto" | "inputTextBreaks"
  "additionalInstructions": "Make the titles catchy", // opcional: até 2000 caracteres
  "folderIds": ["folder-id-1"], // opcional: array de IDs de pastas
  "exportAs": "pdf", // opcional: "pdf" | "pptx" ou array ["pdf", "pptx"]
  "textOptions": {
    "amount": "detailed", // opcional: "brief" | "medium" | "detailed" | "extensive"
    "tone": "professional, inspiring", // opcional: até 500 caracteres
    "audience": "outdoors enthusiasts", // opcional: até 500 caracteres
    "language": "pt-BR" // opcional
  },
  "imageOptions": {
    "source": "aiGenerated", // opcional: "aiGenerated" | "pictographic" | "unsplash" | "giphy" | "webAllImages" | "webFreeToUse" | "webFreeToUseCommercially" | "placeholder" | "noImages"
    "model": "flux-1-pro", // opcional: quando source é "aiGenerated"
    "style": "photorealistic" // opcional: até 500 caracteres, quando source é "aiGenerated"
  },
  "cardOptions": {
    "dimensions": "16x9", // opcional: "fluid" | "16x9" | "4x3" (presentation), "pageless" | "letter" | "a4" (document), "1x1" | "4x5" | "9x16" (social)
    "headerFooter": {
      "topRight": {
        "type": "image",
        "source": "themeLogo",
        "size": "sm"
      },
      "bottomRight": {
        "type": "cardNumber"
      },
      "hideFromFirstCard": true,
      "hideFromLastCard": false
    }
  },
  "sharingOptions": {
    "workspaceAccess": "view", // opcional: "noAccess" | "view" | "comment" | "edit" | "fullAccess"
    "externalAccess": "noAccess", // opcional: "noAccess" | "view" | "comment" | "edit"
    "emailOptions": {
      "recipients": ["email@example.com"], // opcional: array de emails
      "access": "comment" // opcional: "view" | "comment" | "edit" | "fullAccess"
    }
  }
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "generationId": "xxxxxxxxxxx",
    "status": "processing",
    "message": "Gamma está sendo gerado. Use o generationId para verificar o status."
  }
}
```

**Exemplo de Uso:**
```javascript
const response = await fetch('http://localhost:3000/api/documents/generate-gamma', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  },
  body: JSON.stringify({
    companyId: 'seu-company-id',
    inputText: 'Apresentação sobre gestão de condomínios',
    format: 'presentation',
    numCards: 15,
    additionalInstructions: 'Use cores corporativas e inclua gráficos'
  })
});

const data = await response.json();
if (data.success) {
  const generationId = data.data.generationId;
  // Use o generationId para verificar o status
  console.log('Gamma ID:', generationId);
}
```

---

### POST `/api/documents/generate-gamma-from-template`

Cria um novo Gamma a partir de um template existente (beta).

**Headers:**
- `x-company-id`: ID da empresa (obrigatório)
- `x-user-id`: ID do usuário (obrigatório)
- `Content-Type`: `application/json`

**Body:**
```json
{
  "companyId": "uuid-da-empresa",
  "gammaId": "g_abcdef123456ghi", // ID do template Gamma
  "prompt": "Rework this pitch deck for a non-technical audience.",
  "themeId": "Chisel", // opcional: ID do tema (padrão: tema do template)
  "folderIds": ["folder-id-1"], // opcional: array de IDs de pastas
  "exportAs": "pdf", // opcional: "pdf" | "pptx" ou array
  "imageOptions": {
    "model": "imagen-4-pro", // opcional: apenas para templates com imagens AI
    "style": "photorealistic" // opcional: até 500 caracteres
  },
  "sharingOptions": {
    "workspaceAccess": "view",
    "externalAccess": "noAccess",
    "emailOptions": {
      "recipients": ["email@example.com"],
      "access": "comment"
    }
  }
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "generationId": "xxxxxxxxxxx",
    "status": "processing",
    "message": "Gamma está sendo gerado a partir do template. Use o generationId para verificar o status."
  }
}
```

**Exemplo de Uso:**
```javascript
const response = await fetch('http://localhost:3000/api/documents/generate-gamma-from-template', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  },
  body: JSON.stringify({
    companyId: 'seu-company-id',
    gammaId: 'g_abcdef123456ghi', // ID do template
    prompt: 'Adapte esta apresentação para uma audiência não técnica'
  })
});

const data = await response.json();
if (data.success) {
  const generationId = data.data.generationId;
  // Use o generationId para verificar o status
}
```

---

### GET `/api/documents/gamma-status/:generationId`

Verifica o status e obtém URLs dos arquivos gerados pelo Gamma.

**Headers:**
- `x-company-id`: ID da empresa (opcional, mas recomendado)
- `x-user-id`: ID do usuário (opcional, mas recomendado)

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "status": "completed", // "processing" | "completed" | "failed"
    "fileUrls": {
      "gammaUrl": "https://gamma.app/...",
      "pdfUrl": "https://gamma.app/.../export.pdf",
      "pptxUrl": "https://gamma.app/.../export.pptx"
    },
    "error": null // ou mensagem de erro se status for "failed"
  }
}
```

**Exemplo de Uso:**
```javascript
const generationId = 'xxxxxxxxxxx';
const response = await fetch(`http://localhost:3000/api/documents/gamma-status/${generationId}`, {
  headers: {
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  }
});

const data = await response.json();
if (data.success) {
  if (data.data.status === 'completed') {
    console.log('Gamma URL:', data.data.fileUrls.gammaUrl);
    console.log('PDF URL:', data.data.fileUrls.pdfUrl);
  } else if (data.data.status === 'processing') {
    console.log('Ainda processando...');
    // Poll novamente após alguns segundos
  }
}
```

---

### GET `/api/documents/gamma-themes`

Lista temas disponíveis no Gamma para usar na geração.

**Query Parameters:**
- `query`: string - Buscar por nome do tema (case-insensitive)
- `limit`: number - Número de temas por página (máximo 50)
- `after`: string - Cursor para próxima página

**Headers:**
- `x-company-id`: ID da empresa (opcional)
- `x-user-id`: ID do usuário (opcional)

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "themes": [
      {
        "id": "abcdefghi",
        "name": "Prism",
        "type": "custom",
        "colorKeywords": ["light", "blue", "pink", "purple", "pastel", "gradient", "vibrant"],
        "toneKeywords": ["playful", "friendly", "creative", "inspirational", "fun"]
      }
    ],
    "nextCursor": "cursor-para-proxima-pagina" // opcional
  }
}
```

**Exemplo de Uso:**
```javascript
const response = await fetch('http://localhost:3000/api/documents/gamma-themes?limit=10', {
  headers: {
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  }
});

const data = await response.json();
if (data.success) {
  data.data.themes.forEach(theme => {
    console.log(`${theme.name} (${theme.id}): ${theme.type}`);
  });
}
```

---

## 🔔 Rotas de Notificação

### POST `/api/notifications/send`

Envia push notification para um funcionário usando tokens registrados na tabela `push_tokens`.

**Headers:**
- `x-company-id`: ID da empresa (obrigatório)
- `x-user-id`: ID do usuário (obrigatório)
- `Content-Type`: `application/json`

**Body:**
```json
{
  "employeeId": "uuid-do-funcionario",
  "title": "Nova mensagem",
  "body": "Você recebeu uma nova mensagem no sistema",
  "data": {
    "type": "message",
    "messageId": "uuid-da-mensagem",
    "redirectTo": "/messages/123"
  }
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Notificações enviadas com sucesso",
    "metrics": {
      "totalTokensFound": 2,
      "validExpoTokens": 2,
      "ticketsSent": 2
    }
  }
}
```

**Resposta de Erro (quando não há tokens):**
```json
{
  "success": false,
  "data": {
    "success": false,
    "message": "Nenhum token encontrado para este funcionário",
    "metrics": {
      "totalTokensFound": 0,
      "validExpoTokens": 0,
      "ticketsSent": 0
    }
  }
}
```

**Exemplo de Uso:**
```javascript
const response = await fetch('http://localhost:3000/api/notifications/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  },
  body: JSON.stringify({
    employeeId: 'uuid-do-funcionario',
    title: 'Nova ata disponível',
    body: 'Uma nova ata foi gerada e está disponível para assinatura',
    data: {
      type: 'minute',
      minuteId: 'uuid-da-ata',
      redirectTo: '/minutes/123'
    }
  })
});

const data = await response.json();
if (data.success && data.data.success) {
  console.log(`Notificações enviadas: ${data.data.metrics.ticketsSent}`);
}
```

---

### POST `/api/notifications/register-token`

Registra ou atualiza um token de push notification para um funcionário na tabela `push_tokens`.

**Headers:**
- `x-company-id`: ID da empresa (obrigatório)
- `x-user-id`: ID do usuário (obrigatório)
- `Content-Type`: `application/json`

**Body:**
```json
{
  "employeeId": "uuid-do-funcionario",
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "deviceId": "device-uuid", // opcional
  "platform": "ios" // opcional: "ios" | "android" | "unknown"
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "data": {
    "employeeId": "uuid-do-funcionario",
    "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "platform": "ios",
    "deviceId": "device-uuid"
  }
}
```

**Exemplo de Uso:**
```javascript
// No app React Native com Expo
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Obter token do dispositivo
const token = await Notifications.getExpoPushTokenAsync({
  projectId: 'seu-expo-project-id'
});

// Registrar token no backend
const response = await fetch('http://localhost:3000/api/notifications/register-token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'seu-company-id',
    'x-user-id': 'seu-user-id'
  },
  body: JSON.stringify({
    employeeId: 'uuid-do-funcionario',
    pushToken: token.data,
    deviceId: Device.modelId,
    platform: Device.osName === 'iOS' ? 'ios' : 'android'
  })
});

const data = await response.json();
if (data.success) {
  console.log('Token registrado com sucesso!');
}
```

---

## 📝 Notas Importantes

### Variáveis de Ambiente

Adicione ao seu `.env`:
```env
# OpenRouter (já deve existir)
OPENROUTER_API_KEY=sua_chave_openrouter

# Gamma API (novo)
GAMMA_API_KEY=sk-gamma-xxxxxxxxxxxxxxxxxxxxx
```

### Parâmetros Detalhados do Gamma

#### textOptions
- **amount**: Controla quantidade de texto por card
  - `"brief"`: Texto curto
  - `"medium"`: Texto médio (padrão)
  - `"detailed"`: Texto detalhado
  - `"extensive"`: Texto extenso
- **tone**: Define o tom/estilo do texto (até 500 caracteres)
  - Exemplo: `"professional, inspiring"` ou `"playful, friendly"`
- **audience**: Descreve o público-alvo (até 500 caracteres)
  - Exemplo: `"outdoors enthusiasts"` ou `"seven year olds"`
- **language**: Idioma de saída (padrão: "en")

#### imageOptions
- **source**: Fonte das imagens
  - `"aiGenerated"`: Gera imagens com IA (pode especificar model e style)
  - `"pictographic"`: Usa Pictographic
  - `"unsplash"`: Usa Unsplash
  - `"giphy"`: Usa GIFs do Giphy
  - `"webAllImages"`: Busca na web (licença desconhecida)
  - `"webFreeToUse"`: Busca na web (uso pessoal)
  - `"webFreeToUseCommercially"`: Busca na web (uso comercial)
  - `"placeholder"`: Cria placeholders para adicionar depois
  - `"noImages"`: Sem imagens (use se fornecer URLs no inputText)
- **model**: Modelo de IA para gerar imagens (quando source é "aiGenerated")
  - Exemplos: `"flux-1-pro"`, `"imagen-4-pro"`, `"dall-e-3"`
- **style**: Estilo visual das imagens (até 500 caracteres)
  - Exemplo: `"photorealistic"` ou `"minimal, black and white, line art"`

#### cardOptions
- **dimensions**: Proporção dos cards
  - **Presentation**: `"fluid"` (padrão), `"16x9"`, `"4x3"`
  - **Document**: `"fluid"` (padrão), `"pageless"`, `"letter"`, `"a4"`
  - **Social**: `"1x1"`, `"4x5"` (padrão, bom para Instagram/LinkedIn), `"9x16"` (stories)
- **headerFooter**: Configura elementos no cabeçalho/rodapé
  - Posições: `topLeft`, `topRight`, `topCenter`, `bottomLeft`, `bottomRight`, `bottomCenter`
  - Tipos: `"text"`, `"image"`, `"cardNumber"`
  - Para imagens: `source: "themeLogo"` ou `source: "custom"` (com `src: "URL"`)
  - Tamanhos de imagem: `"sm"`, `"md"`, `"lg"`, `"xl"`
  - `hideFromFirstCard`: boolean (ocultar do primeiro card)
  - `hideFromLastCard`: boolean (ocultar do último card)

#### sharingOptions
- **workspaceAccess**: Acesso para membros do workspace
  - `"noAccess"`, `"view"`, `"comment"`, `"edit"`, `"fullAccess"`
- **externalAccess**: Acesso para pessoas fora do workspace
  - `"noAccess"`, `"view"`, `"comment"`, `"edit"`
- **emailOptions**: Compartilhar por email
  - `recipients`: Array de emails
  - `access`: `"view"`, `"comment"`, `"edit"`, `"fullAccess"`

#### cardSplit e numCards
- **cardSplit: "auto"**: Gamma divide automaticamente baseado em `numCards`
- **cardSplit: "inputTextBreaks"**: Gamma divide baseado em `\n---\n` no texto
- Use `\n---\n` no `inputText` para forçar quebras de card quando `cardSplit` é `"inputTextBreaks"`

#### Adicionar Imagens no inputText
Você pode incluir URLs de imagens diretamente no `inputText`:
```
"inputText": "Título da apresentação\n\nhttps://example.com/image1.jpg\n\nConteúdo do primeiro card\n---\nSegundo card com outra imagem\n\nhttps://example.com/image2.jpg"
```

Se quiser usar APENAS suas imagens (sem gerar outras), defina:
```json
{
  "imageOptions": {
    "source": "noImages"
  }
}
```

### Como Funciona o Fluxo de Gamma

1. **Gerar Gamma**: Chame `POST /api/documents/generate-gamma` com o texto
2. **Obter generationId**: A resposta retorna um `generationId`
3. **Polling de Status**: Use `GET /api/documents/gamma-status/:generationId` para verificar o status
4. **Obter URLs**: Quando `status === "completed"`, as URLs estarão em `fileUrls`

**Exemplo de Polling:**
```javascript
async function waitForGamma(generationId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`http://localhost:3000/api/documents/gamma-status/${generationId}`);
    const data = await response.json();
    
    if (data.data.status === 'completed') {
      return data.data.fileUrls;
    } else if (data.data.status === 'failed') {
      throw new Error(data.data.error || 'Falha ao gerar Gamma');
    }
    
    // Aguardar 2 segundos antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Timeout aguardando geração do Gamma');
}
```

### Tokens de Push Notification

- Os tokens devem ser do formato Expo: `ExponentPushToken[...]`
- Um funcionário pode ter múltiplos tokens (diferentes dispositivos)
- O sistema envia notificações para todos os tokens registrados do funcionário
- Use `register-token` sempre que o app iniciar ou o token mudar

