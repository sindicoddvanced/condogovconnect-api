# Diferença entre Resumo e Ata

## Resumo (Summary)

**Características:**
- ✅ **Conciso e direto** - Foca nos pontos principais
- ✅ **Formato JSON estruturado** - Dados organizados para fácil consumo
- ✅ **Tamanho limitado** - Máximo de 500-2000 caracteres (configurável)
- ✅ **Focado em highlights** - Destaques, decisões, próximos passos
- ✅ **Linguagem mais acessível** - Pode ser menos formal
- ✅ **Temperature: 0.4** - Mais flexível para síntese

**Estrutura do Resumo:**
```json
{
  "summary": "Texto conciso do resumo principal",
  "highlights": ["destaque 1", "destaque 2"],
  "actionItems": [
    {
      "description": "...",
      "assignee": "...",
      "dueDate": "YYYY-MM-DD",
      "priority": "high|medium|low"
    }
  ],
  "decisions": [
    {
      "item": "...",
      "decision": "...",
      "approved": true|false
    }
  ],
  "nextSteps": ["próximo passo 1", "próximo passo 2"]
}
```

**Tipos de Resumo:**
- `executive` - Resumo executivo conciso
- `detailed` - Resumo detalhado (ainda assim resumido)
- `action_items` - Apenas ações e tarefas
- `decisions` - Apenas decisões e votações

**Uso:** Para leitura rápida, dashboards, notificações, relatórios executivos

---

## Ata (Minutes)

**Características:**
- ✅ **Documento formal completo** - Todas as informações da reunião
- ✅ **Formato texto estruturado** - Markdown, PDF ou Word
- ✅ **Sem limite de tamanho** - Documento completo e detalhado
- ✅ **Estrutura jurídica obrigatória** - Seções padronizadas
- ✅ **Linguagem formal e técnica** - Apropriada para documentos jurídicos
- ✅ **Temperature: 0.2** - Mais preciso para documentos formais
- ✅ **Max tokens: 6000** - Permite documentos longos

**Estrutura da Ata:**
```
# ATA DE ASSEMBLEIA

## CABEÇALHO
- Título: ATA DE ASSEMBLEIA
- Data e hora da reunião
- Local da reunião
- Tipo de assembleia (ordinária, extraordinária, especial)

## ABERTURA
- Declaração de abertura
- Quórum presente
- Verificação de legitimidade dos participantes

## PARTICIPANTES
- Lista completa e detalhada de todos os participantes
- Identificação de cada participante (nome, unidade, função)
- Presença de síndico, conselheiros, moradores

## ORDEM DO DIA
- Lista completa de todos os assuntos discutidos
- Numeração clara de cada item
- Descrição de cada ponto da pauta

## DELIBERAÇÕES
- Registro detalhado de todas as discussões
- Argumentos apresentados
- Propostas feitas
- Observações importantes

## VOTAÇÕES
- Registro de cada votação realizada
- Resultado detalhado (votos a favor, contra, abstenções)
- Decisões tomadas
- Aprovações e rejeições

## ENCERRAMENTO
- Declaração de encerramento
- Data e hora do encerramento
- Assinaturas (quando aplicável)
```

**Seções Padrão:**
- `abertura`
- `participantes`
- `ordem_do_dia`
- `deliberacoes`
- `votacoes`
- `encerramento`

**Uso:** Documento oficial, processos judiciais, arquivo permanente, assinatura digital

---

## Comparação Rápida

| Característica | Resumo | Ata |
|----------------|--------|-----|
| **Formato** | JSON estruturado | Texto formatado (Markdown/PDF/Word) |
| **Tamanho** | Limitado (500-2000 chars) | Completo (sem limite) |
| **Linguagem** | Acessível | Formal e jurídica |
| **Estrutura** | Highlights, ações, decisões | Seções jurídicas obrigatórias |
| **Precisão** | Temperature 0.4 | Temperature 0.2 |
| **Tokens** | ~2000 | ~6000 |
| **Uso** | Leitura rápida, dashboards | Documento oficial, jurídico |
| **Detalhamento** | Pontos principais | Tudo que foi discutido |

---

## Exemplo de Uso na API

### Resumo
```json
{
  "transcriptionType": "audio_summary",
  "summaryOptions": {
    "summaryType": "executive",
    "maxLength": 500
  }
}
```

**Retorna:**
```json
{
  "transcription": { ... },
  "summary": {
    "text": "Resumo conciso de 500 caracteres...",
    "highlights": ["...", "..."],
    "actionItems": [...],
    "decisions": [...]
  }
}
```

### Ata
```json
{
  "transcriptionType": "audio_minutes",
  "minutesOptions": {
    "format": "markdown",
    "includeSections": ["abertura", "participantes", "ordem_do_dia", "deliberacoes", "votacoes", "encerramento"]
  }
}
```

**Retorna:**
```json
{
  "transcription": { ... },
  "minutes": {
    "minuteId": "uuid",
    "content": "# ATA DE ASSEMBLEIA\n\n## CABEÇALHO\n...",
    "format": "markdown",
    "fileUrl": "url-do-pdf-se-gerado"
  }
}
```

---

## Logs Implementados

Agora você verá logs detalhados para cada processo:

### Resumo
```
[Summary] Gerando resumo da transcrição
[Summary] Tipo: executive
[Summary] Tamanho máximo: 500
[Summary] Enviando requisição para gerar resumo...
[Summary] Resumo gerado em 2500 ms
[Summary] Tokens usados: 1200
[Summary] Tamanho do resumo: 485 caracteres
[Summary] Highlights: 5
[Summary] Action items: 8
[Summary] Decisions: 3
```

### Ata
```
[Minutes] Gerando ATA formal da transcrição
[Minutes] Formato: markdown
[Minutes] ATA é diferente de resumo: documento jurídico completo e estruturado
[Minutes] Enviando requisição para gerar ATA completa...
[Minutes] ATA gerada em 8000 ms
[Minutes] Tokens usados: 4500
[Minutes] Tamanho da ATA gerada: 8500 caracteres
```

