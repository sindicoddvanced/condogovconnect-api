# 📋 Guia de Integração - Sistema de Atas | Frontend

## 🎯 Visão Geral

Este documento descreve como integrar o frontend React com as APIs do Sistema de Atas do CondoGov, implementando as **3 modalidades distintas** conforme especificado no PRD.

### Modalidades Implementadas

1. **Nova Ata (Aprimorada)** - Sistema completo com IA, transcrição e assinatura
2. **Transcrever Gravação** - Foco em transcrição e edição
3. **Nova Ata (Básica)** - Criação rápida e automática

---

## 🔧 Configuração Inicial

### Variáveis de Ambiente

```env
# API Base URL
VITE_API_BASE_URL=http://localhost:3000

# Headers obrigatórios para todas as requisições
VITE_DEFAULT_COMPANY_ID=a0000000-0000-0000-0000-000000000001
VITE_DEFAULT_USER_ID=b1111111-1111-1111-1111-111111111111
```

### Headers Obrigatórios

Todas as requisições devem incluir:

```typescript
const headers = {
  'Content-Type': 'application/json',
  'x-company-id': companyId,
  'x-user-id': userId,
};
```

---

## 🎙️ **MODALIDADE 1: Nova Ata (Aprimorada)**

### Fluxo Completo

```typescript
// 1. Upload de arquivo + criação de assembleia
const uploadRecording = async (file: File, assemblyDetails: any) => {
  const formData = new FormData();
  formData.append('recording', file);
  formData.append('roomId', `assembly-${Date.now()}`);
  formData.append('roomName', assemblyDetails.title);
  formData.append('isAssembly', 'true');
  formData.append('assemblyTitle', assemblyDetails.title);
  formData.append('clientId', assemblyDetails.clientId);
  formData.append('assemblyDescription', assemblyDetails.description);

  const response = await fetch(`${API_BASE_URL}/api/transcription/videoconference/recordings/upload`, {
    method: 'POST',
    headers: {
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: formData,
  });

  return response.json();
};

// 2. Criar assembleia automaticamente
const createAssembly = async (recordingId: number, assemblyDetails: any) => {
  const response = await fetch(`${API_BASE_URL}/api/assembly/assemblies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      title: assemblyDetails.title,
      description: assemblyDetails.description,
      scheduledDate: assemblyDetails.scheduledDate,
      location: assemblyDetails.location || 'Virtual',
      status: 'realizada',
      clientId: assemblyDetails.clientId,
      recordingId: recordingId,
    }),
  });

  return response.json();
};

// 3. Verificar status do processamento
const checkProcessingStatus = async (recordingId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/transcription/videoconference/recordings/${recordingId}/status`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};

// 4. Buscar transcrição
const getTranscription = async (assemblyId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/assembly/transcription/${assemblyId}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};

// 5. Gerar ata com IA
const generateMinutes = async (assemblyId: string, options: any) => {
  const response = await fetch(`${API_BASE_URL}/api/minutes/generate/${assemblyId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      format: options.format || 'markdown',
      generatePdf: options.sendForSignature || false,
      aiSummary: options.useAiSummary || true,
      sendForSignature: options.sendForSignature || false,
      customTranscription: options.editedTranscription,
      signers: options.signers || [],
    }),
  });

  return response.json();
};
```

### Exemplo de Implementação React

```typescript
// Hook para Nova Ata Aprimorada
const useNovaAtaAprimorada = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'transcription' | 'generate'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [assemblyId, setAssemblyId] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<string>('idle');
  const [transcriptionData, setTranscriptionData] = useState<any>(null);
  const [editedTranscription, setEditedTranscription] = useState<string>('');
  const [isEditingEnabled, setIsEditingEnabled] = useState<boolean>(false);

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; assemblyDetails: any }) => {
      const uploadResult = await uploadRecording(data.file, data.assemblyDetails);
      setRecordingId(uploadResult.recording.id);
      
      const assemblyResult = await createAssembly(uploadResult.recording.id, data.assemblyDetails);
      setAssemblyId(assemblyResult.id);
      
      return { uploadResult, assemblyResult };
    },
    onSuccess: () => {
      setProcessingStatus('processing');
      setActiveTab('transcription');
    },
  });

  const statusMutation = useMutation({
    mutationFn: checkProcessingStatus,
    onSuccess: (data) => {
      setProcessingStatus(data.status);
      if (data.status === 'completed') {
        fetchTranscription();
      }
    },
  });

  const transcriptionQuery = useQuery({
    queryKey: ['transcription', assemblyId],
    queryFn: () => getTranscription(assemblyId),
    enabled: !!assemblyId && processingStatus === 'completed',
    onSuccess: (data) => {
      setTranscriptionData(data);
      setEditedTranscription(data.transcript);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (options: any) => generateMinutes(assemblyId, options),
    onSuccess: (data) => {
      // Navegar para a ata criada
      navigate(`/atas/${data.assemblyMinuteId}`);
    },
  });

  return {
    activeTab,
    setActiveTab,
    file,
    setFile,
    recordingId,
    assemblyId,
    processingStatus,
    transcriptionData,
    editedTranscription,
    setEditedTranscription,
    isEditingEnabled,
    setIsEditingEnabled,
    uploadMutation,
    statusMutation,
    transcriptionQuery,
    generateMutation,
  };
};
```

---

## 🎙️ **MODALIDADE 2: Transcrever Gravação**

### Fluxo Simplificado

```typescript
// 1. Upload direto para transcrição
const uploadForTranscription = async (file: File, details: any) => {
  const formData = new FormData();
  formData.append('recording', file);
  formData.append('roomId', `transcription-${Date.now()}`);
  formData.append('roomName', details.title);
  formData.append('isAssembly', 'true');

  const response = await fetch(`${API_BASE_URL}/api/transcription/videoconference/recordings/upload`, {
    method: 'POST',
    headers: {
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: formData,
  });

  return response.json();
};

// 2. Gerar ata diretamente da gravação
const generateMinutesFromRecording = async (recordingId: string, options: any) => {
  const response = await fetch(`${API_BASE_URL}/api/minutes/generate-from-recording/${recordingId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      format: options.format || 'markdown',
      aiSummary: options.aiSummary || true,
    }),
  });

  return response.json();
};
```

### Exemplo de Implementação React

```typescript
// Hook para Transcrever Gravação
const useTranscreverGravacao = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'transcription'>('upload');
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [transcriptionData, setTranscriptionData] = useState<any>(null);

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; details: any }) => {
      const result = await uploadForTranscription(data.file, data.details);
      setRecordingId(result.recording.id);
      return result;
    },
    onSuccess: () => {
      setActiveTab('transcription');
    },
  });

  const generateMutation = useMutation({
    mutationFn: (options: any) => generateMinutesFromRecording(recordingId!.toString(), options),
    onSuccess: (data) => {
      navigate(`/atas/${data.assemblyMinuteId}`);
    },
  });

  return {
    activeTab,
    setActiveTab,
    recordingId,
    transcriptionData,
    uploadMutation,
    generateMutation,
  };
};
```

---

## 📝 **MODALIDADE 3: Nova Ata (Básica)**

### Fluxo Automático

```typescript
// Upload + processamento automático
const processBasicAta = async (file: File, assemblyDetails: any) => {
  // 1. Upload
  const formData = new FormData();
  formData.append('recording', file);
  formData.append('roomId', `assembly-${Date.now()}`);
  formData.append('roomName', assemblyDetails.title);
  formData.append('isAssembly', 'true');

  const uploadResponse = await fetch(`${API_BASE_URL}/api/transcription/videoconference/recordings/upload`, {
    method: 'POST',
    headers: {
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: formData,
  });

  const uploadResult = await uploadResponse.json();

  // 2. Criar assembleia
  const assemblyResponse = await fetch(`${API_BASE_URL}/api/assembly/assemblies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      title: assemblyDetails.title,
      description: 'Auto-generated',
      location: 'Virtual',
      status: 'realizada',
      clientId: assemblyDetails.clientId,
      recordingId: uploadResult.recording.id,
    }),
  });

  const assemblyResult = await assemblyResponse.json();

  // 3. Gerar ata automaticamente
  const minutesResponse = await fetch(`${API_BASE_URL}/api/minutes/generate/${assemblyResult.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      format: 'markdown',
      aiSummary: true,
      sendForSignature: false,
    }),
  });

  return minutesResponse.json();
};
```

### Exemplo de Implementação React

```typescript
// Hook para Nova Ata Básica
const useNovaAtaBasica = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('idle');
  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const processMutation = useMutation({
    mutationFn: async (data: { file: File; assemblyDetails: any }) => {
      setProcessingStatus('processing');
      setProcessingProgress(10);
      
      const result = await processBasicAta(data.file, data.assemblyDetails);
      
      setProcessingProgress(100);
      setProcessingStatus('completed');
      
      return result;
    },
    onSuccess: (data) => {
      setTimeout(() => {
        navigate(`/atas/${data.assemblyMinuteId}`);
      }, 2000);
    },
  });

  return {
    file,
    setFile,
    processingStatus,
    processingProgress,
    processMutation,
  };
};
```

---

## 📊 **APIs de Listagem e Gestão**

### Listar Atas

```typescript
const getMinutes = async (filters: any = {}) => {
  const params = new URLSearchParams();
  if (filters.clientId) params.append('clientId', filters.clientId);
  if (filters.status) params.append('status', filters.status);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await fetch(`${API_BASE_URL}/api/minutes?${params}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};
```

### Buscar Ata Específica

```typescript
const getMinute = async (minuteId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/minutes/${minuteId}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};
```

### Adicionar Assinantes

```typescript
const addSigners = async (minuteId: string, signers: any[]) => {
  const response = await fetch(`${API_BASE_URL}/api/minutes/${minuteId}/signatures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      signers: signers.map((signer, index) => ({
        name: signer.name,
        email: signer.email,
        role: signer.role,
      })),
    }),
  });

  return response.json();
};
```

### Download PDF

```typescript
const downloadPdf = async (minuteId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/minutes/${minuteId}/download/pdf`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ata-${minuteId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
};
```

---

## 🔐 **APIs de Assinatura Digital**

### Criar Documento para Assinatura

```typescript
const createSignatureDocument = async (minuteId: string, signers: any[]) => {
  // 1. Gerar PDF da ata
  const pdfResponse = await fetch(`${API_BASE_URL}/api/minutes/${minuteId}/download/pdf`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  const pdfBlob = await pdfResponse.blob();
  const pdfBase64 = await blobToBase64(pdfBlob);

  // 2. Criar documento no Autentique
  const response = await fetch(`${API_BASE_URL}/api/autentique/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      name: `Ata de Assembleia - ${new Date().toLocaleDateString()}`,
      files: [{
        file: pdfBase64,
        filename: `ata-${minuteId}.pdf`,
      }],
      signers: signers.map((signer, index) => ({
        name: signer.name,
        email: signer.email,
        phone: signer.phone,
        action: 'SIGN',
        order: index + 1,
      })),
      settings: {
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias
        reminder_frequency: 'daily',
        allow_decline: false,
      },
    }),
  });

  return response.json();
};
```

### Verificar Status da Assinatura

```typescript
const getSignatureStatus = async (documentId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/autentique/documents/${documentId}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};
```

---

## 📈 **APIs de Analytics**

### Dashboard Completo

```typescript
const getDashboard = async (period: string = '30d') => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/dashboard?period=${period}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};
```

### Métricas de Assembleias

```typescript
const getAssemblyMetrics = async (startDate?: string, endDate?: string, clientId?: string) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (clientId) params.append('client_id', clientId);

  const response = await fetch(`${API_BASE_URL}/api/analytics/assembly-metrics?${params}`, {
    headers: {
      'x-company-id': companyId,
    },
  });

  return response.json();
};
```

---

## 🛠️ **Utilitários e Helpers**

### Converter Blob para Base64

```typescript
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // Remove data:application/pdf;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
```

### Validação de Arquivo

```typescript
const validateAudioFile = (file: File): { valid: boolean; error?: string } => {
  const allowedTypes = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'audio/x-m4a', 'audio/m4a', 'video/mp4', 'video/webm'
  ];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido. Tipos permitidos: ${allowedTypes.join(', ')}`
    };
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > 1000) { // 1GB
    return {
      valid: false,
      error: 'Arquivo muito grande. Tamanho máximo: 1000MB'
    };
  }

  return { valid: true };
};
```

### Hook para Gerenciamento de Estado

```typescript
// Hook principal para gerenciar todas as modalidades
const useAtasSystem = () => {
  const [activeModal, setActiveModal] = useState<'aprimorada' | 'transcricao' | 'basica'>('aprimorada');
  
  const novaAtaAprimorada = useNovaAtaAprimorada();
  const transcreverGravacao = useTranscreverGravacao();
  const novaAtaBasica = useNovaAtaBasica();

  const getCurrentHook = () => {
    switch (activeModal) {
      case 'aprimorada':
        return novaAtaAprimorada;
      case 'transcricao':
        return transcreverGravacao;
      case 'basica':
        return novaAtaBasica;
      default:
        return novaAtaAprimorada;
    }
  };

  return {
    activeModal,
    setActiveModal,
    currentHook: getCurrentHook(),
    novaAtaAprimorada,
    transcreverGravacao,
    novaAtaBasica,
  };
};
```

---

## 🎨 **Exemplos de Componentes React**

### Componente de Upload

```typescript
interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  onUpload: (file: File, details: any) => void;
  loading?: boolean;
  progress?: number;
}

const AudioUploader: React.FC<AudioUploaderProps> = ({
  onFileSelect,
  onUpload,
  loading = false,
  progress = 0,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selectedFile: File) => {
    const validation = validateAudioFile(selectedFile);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    setFile(selectedFile);
    onFileSelect(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileChange(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging 
          ? 'border-primary bg-primary/10' 
          : 'border-gray-300 hover:border-gray-400'
      }`}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="space-y-4">
        <div className="mx-auto w-12 h-12 text-gray-400">
          <Upload className="w-full h-full" />
        </div>
        
        <div>
          <p className="text-lg font-medium">
            {file ? file.name : 'Arraste e solte seu arquivo aqui'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {file 
              ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
              : 'Ou clique para selecionar um arquivo'
            }
          </p>
        </div>
        
        <Button 
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {loading ? 'Processando...' : 'Selecionar Arquivo'}
        </Button>
        
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="audio/*,video/*,.mp3,.wav,.mp4,.avi,.mov,.mkv"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) {
              handleFileChange(selectedFile);
            }
          }}
        />
        
        {loading && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-blue-600">
              Processando arquivo... {progress}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Componente de Lista de Atas

```typescript
const AtasList: React.FC = () => {
  const [filters, setFilters] = useState({
    clientId: 'todos',
    status: 'todos',
  });

  const { data: minutes, isLoading } = useQuery({
    queryKey: ['minutes', filters],
    queryFn: () => getMinutes(filters),
  });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

  if (isLoading) {
    return <div>Carregando atas...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center space-x-2">
        <Select value={filters.clientId} onValueChange={(value) => 
          setFilters(prev => ({ ...prev, clientId: value }))
        }>
          <SelectTrigger>
            <SelectValue placeholder="Filtrar por cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {clients?.map((client: any) => (
              <SelectItem key={client.id} value={client.id.toString()}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={filters.status} onValueChange={(value) => 
          setFilters(prev => ({ ...prev, status: value }))
        }>
          <SelectTrigger>
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="assinando">Em assinatura</SelectItem>
            <SelectItem value="finalizada">Finalizada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de atas */}
      <div className="space-y-2">
        {minutes?.map((minute: any) => (
          <div key={minute.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{minute.title}</h3>
                <p className="text-sm text-gray-500">
                  {formatDate(minute.created_at)}
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Badge variant={
                  minute.status === 'finalizada' ? 'default' :
                  minute.status === 'assinando' ? 'secondary' :
                  'outline'
                }>
                  {minute.status}
                </Badge>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPdf(minute.id)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/atas/${minute.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 🚀 **Exemplo de Implementação Completa**

### Página Principal de Atas

```typescript
const AtasPage: React.FC = () => {
  const { activeModal, setActiveModal } = useAtasSystem();

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sistema de Atas</h1>
        
        <div className="flex space-x-2">
          <Button
            onClick={() => setActiveModal('aprimorada')}
            variant={activeModal === 'aprimorada' ? 'default' : 'outline'}
          >
            Nova Ata (Aprimorada)
          </Button>
          
          <Button
            onClick={() => setActiveModal('transcricao')}
            variant={activeModal === 'transcricao' ? 'default' : 'outline'}
          >
            Transcrever Gravação
          </Button>
          
          <Button
            onClick={() => setActiveModal('basica')}
            variant={activeModal === 'basica' ? 'default' : 'outline'}
          >
            Nova Ata (Básica)
          </Button>
        </div>
      </div>

      {/* Renderizar componente baseado na modalidade ativa */}
      {activeModal === 'aprimorada' && <NovaAtaAprimorada />}
      {activeModal === 'transcricao' && <TranscreverGravacao />}
      {activeModal === 'basica' && <NovaAtaBasica />}
    </div>
  );
};
```

---

## 📋 **Checklist de Implementação**

### ✅ Configuração Inicial
- [ ] Configurar variáveis de ambiente
- [ ] Implementar headers obrigatórios
- [ ] Configurar base URL da API

### ✅ Modalidade 1: Nova Ata (Aprimorada)
- [ ] Implementar upload de arquivo
- [ ] Criar sistema de abas (upload → transcrição → geração)
- [ ] Implementar edição de transcrição
- [ ] Configurar assinatura digital
- [ ] Implementar geração de PDF

### ✅ Modalidade 2: Transcrever Gravação
- [ ] Implementar upload simplificado
- [ ] Criar editor de transcrição
- [ ] Implementar geração direta de ata

### ✅ Modalidade 3: Nova Ata (Básica)
- [ ] Implementar fluxo automático
- [ ] Criar interface simplificada
- [ ] Implementar processamento automático

### ✅ Funcionalidades Gerais
- [ ] Listar atas com filtros
- [ ] Visualizar ata específica
- [ ] Download de PDF
- [ ] Gestão de assinantes
- [ ] Envio de lembretes

### ✅ Integração com Autentique
- [ ] Criar documentos para assinatura
- [ ] Verificar status de assinatura
- [ ] Processar webhooks

### ✅ Analytics e Métricas
- [ ] Implementar dashboard
- [ ] Exibir métricas de assembleias
- [ ] Mostrar estatísticas de uso

---

## 🔧 **Troubleshooting**

### Erro de CORS
```typescript
// Verificar se os headers estão sendo enviados corretamente
const headers = {
  'Content-Type': 'application/json',
  'x-company-id': companyId,
  'x-user-id': userId,
};
```

### Erro de Upload
```typescript
// Verificar tamanho e tipo do arquivo
const validation = validateAudioFile(file);
if (!validation.valid) {
  console.error(validation.error);
  return;
}
```

### Erro de Processamento
```typescript
// Verificar status do processamento
const status = await checkProcessingStatus(recordingId);
console.log('Status:', status);
```

---

## 📞 **Suporte**

Para dúvidas ou problemas na implementação:

1. Verificar logs do console do navegador
2. Verificar logs da API no terminal
3. Testar endpoints individualmente
4. Verificar configuração das variáveis de ambiente

---

**Documentação completa para integração do Sistema de Atas - Frontend React**  
**Versão 1.0 - Janeiro 2025**
