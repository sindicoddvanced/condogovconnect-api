import type { RequestContext } from "../types/ai.js";

/**
 * Serviço para integração com Autentique (assinatura digital)
 * Implementa as APIs conforme especificado no PRD
 */
export class AutentiqueService {
  private autentiqueToken: string;
  private baseUrl: string;

  constructor() {
    this.autentiqueToken = process.env.AUTENTIQUE_TOKEN || "";
    this.baseUrl = process.env.AUTENTIQUE_SANDBOX === "true" 
      ? "https://api.autentique.com.br/v2/sandbox"
      : "https://api.autentique.com.br/v2";

    if (!this.autentiqueToken) {
      console.warn("AUTENTIQUE_TOKEN not configured, signature features will be disabled");
    }
  }

  /**
   * Cria documento para assinatura
   */
  async createDocument(data: any, context: RequestContext) {
    try {
      if (!this.autentiqueToken) {
        throw new Error("Autentique token not configured");
      }

      // 1. Preparar dados para o Autentique
      const autentiqueData = this.prepareAutentiqueData(data, context);

      // 2. Chamar API do Autentique
      const response = await this.callAutentiqueAPI("/documents", "POST", autentiqueData);

      // 3. Salvar no banco
      const documentId = await this.saveDocument({
        companyId: context.companyId,
        autentiqueId: response.document_id,
        name: data.name,
        signers: data.signers,
        settings: data.settings,
        createdBy: context.userId,
      });

      return {
        document_id: response.document_id,
        signing_url: response.signing_url,
        status: "pending",
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error creating document:", error);
      throw error;
    }
  }

  /**
   * Busca status do documento
   */
  async getDocumentStatus(documentId: string, companyId: string) {
    try {
      if (!this.autentiqueToken) {
        throw new Error("Autentique token not configured");
      }

      // 1. Buscar no banco
      const document = await this.getDocumentFromDatabase(documentId, companyId);
      if (!document) {
        throw new Error("Documento não encontrado");
      }

      // 2. Buscar status no Autentique
      const autentiqueStatus = await this.callAutentiqueAPI(`/documents/${document.autentiqueId}`, "GET");

      // 3. Atualizar status no banco
      await this.updateDocumentStatus(documentId, autentiqueStatus);

      return {
        document_id: documentId,
        autentique_id: document.autentiqueId,
        status: autentiqueStatus.status,
        signers: autentiqueStatus.signers,
        created_at: document.created_at,
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting document status:", error);
      throw error;
    }
  }

  /**
   * Processa webhook do Autentique
   */
  async processWebhook(webhookData: any) {
    try {
      console.log("📨 Autentique webhook received:", webhookData);

      // 1. Validar dados do webhook
      const event = webhookData.event;
      const documentId = webhookData.document_id;
      const signerId = webhookData.signer_id;

      // 2. Buscar documento no banco
      const document = await this.getDocumentByAutentiqueId(documentId);
      if (!document) {
        console.warn(`Document not found for autentique_id: ${documentId}`);
        return { processed: false, reason: "Document not found" };
      }

      // 3. Processar evento
      switch (event) {
        case "document.signed":
          await this.handleDocumentSigned(document, webhookData);
          break;
        case "document.completed":
          await this.handleDocumentCompleted(document, webhookData);
          break;
        case "document.declined":
          await this.handleDocumentDeclined(document, webhookData);
          break;
        case "signer.signed":
          await this.handleSignerSigned(document, webhookData);
          break;
        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      return { processed: true, event, documentId };
    } catch (error) {
      console.error("Error processing webhook:", error);
      throw error;
    }
  }

  /**
   * Lista documentos
   */
  async getDocuments(companyId: string, filters: any = {}) {
    try {
      const documents = await this.getDocumentsFromDatabase(companyId, filters);
      return documents;
    } catch (error) {
      console.error("Error getting documents:", error);
      throw error;
    }
  }

  /**
   * Cancela documento
   */
  async cancelDocument(documentId: string, companyId: string) {
    try {
      if (!this.autentiqueToken) {
        throw new Error("Autentique token not configured");
      }

      // 1. Buscar documento no banco
      const document = await this.getDocumentFromDatabase(documentId, companyId);
      if (!document) {
        throw new Error("Documento não encontrado");
      }

      // 2. Cancelar no Autentique
      await this.callAutentiqueAPI(`/documents/${document.autentiqueId}/cancel`, "POST");

      // 3. Atualizar status no banco
      await this.updateDocumentStatus(documentId, { status: "cancelled" });

      return {
        document_id: documentId,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error cancelling document:", error);
      throw error;
    }
  }

  /**
   * Envia lembrete
   */
  async sendReminder(documentId: string, data: any, companyId: string) {
    try {
      if (!this.autentiqueToken) {
        throw new Error("Autentique token not configured");
      }

      // 1. Buscar documento no banco
      const document = await this.getDocumentFromDatabase(documentId, companyId);
      if (!document) {
        throw new Error("Documento não encontrado");
      }

      // 2. Enviar lembrete no Autentique
      await this.callAutentiqueAPI(`/documents/${document.autentiqueId}/remind`, "POST", data);

      return {
        document_id: documentId,
        reminder_sent: true,
        sent_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error sending reminder:", error);
      throw error;
    }
  }

  /**
   * Verifica assinatura do webhook
   */
  async verifyWebhookSignature(body: any, signature: string): Promise<boolean> {
    try {
      const webhookSecret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.warn("AUTENTIQUE_WEBHOOK_SECRET not configured, skipping signature verification");
        return true;
      }

      // Implementar verificação de assinatura HMAC
      // Por enquanto, sempre retorna true
      return true;
    } catch (error) {
      console.error("Error verifying webhook signature:", error);
      return false;
    }
  }

  /**
   * Prepara dados para o Autentique
   */
  private prepareAutentiqueData(data: any, context: RequestContext) {
    return {
      name: data.name,
      files: data.files.map((file: any) => ({
        file: file.file, // base64
        filename: file.filename,
      })),
      signers: data.signers.map((signer: any) => ({
        name: signer.name,
        email: signer.email,
        phone: signer.phone,
        action: signer.action,
        order: signer.order,
      })),
      settings: {
        deadline: data.settings?.deadline,
        reminder_frequency: data.settings?.reminder_frequency,
        allow_decline: data.settings?.allow_decline,
      },
      metadata: {
        company_id: context.companyId,
        created_by: context.userId,
      },
    };
  }

  /**
   * Chama API do Autentique
   */
  private async callAutentiqueAPI(endpoint: string, method: string, data?: any) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          "Authorization": `Bearer ${this.autentiqueToken}`,
          "Content-Type": "application/json",
        },
      };

      if (data && method !== "GET") {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Autentique API error: ${response.status} ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error calling Autentique API:", error);
      throw error;
    }
  }

  /**
   * Manipula documento assinado
   */
  private async handleDocumentSigned(document: any, webhookData: any) {
    console.log(`📝 Document signed: ${document.id}`);
    await this.updateDocumentStatus(document.id, {
      status: "signed",
      signed_at: webhookData.signed_at,
      signer_name: webhookData.signer_name,
      signer_email: webhookData.signer_email,
    });
  }

  /**
   * Manipula documento completado
   */
  private async handleDocumentCompleted(document: any, webhookData: any) {
    console.log(`✅ Document completed: ${document.id}`);
    await this.updateDocumentStatus(document.id, {
      status: "completed",
      completed_at: webhookData.completed_at,
    });
  }

  /**
   * Manipula documento recusado
   */
  private async handleDocumentDeclined(document: any, webhookData: any) {
    console.log(`❌ Document declined: ${document.id}`);
    await this.updateDocumentStatus(document.id, {
      status: "declined",
      declined_at: webhookData.declined_at,
      decline_reason: webhookData.decline_reason,
    });
  }

  /**
   * Manipula assinante assinado
   */
  private async handleSignerSigned(document: any, webhookData: any) {
    console.log(`✍️ Signer signed: ${webhookData.signer_name} for document ${document.id}`);
    await this.updateSignerStatus(document.id, webhookData.signer_id, {
      status: "signed",
      signed_at: webhookData.signed_at,
    });
  }

  /**
   * Salva documento no banco
   */
  private async saveDocument(data: any): Promise<string> {
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`💾 Document saved (simulated): ${documentId}`);
    return documentId;
  }

  /**
   * Atualiza status do documento
   */
  private async updateDocumentStatus(documentId: string, statusData: any) {
    console.log(`💾 Document status updated (simulated): ${documentId} -> ${statusData.status}`);
  }

  /**
   * Atualiza status do assinante
   */
  private async updateSignerStatus(documentId: string, signerId: string, statusData: any) {
    console.log(`💾 Signer status updated (simulated): ${signerId} -> ${statusData.status}`);
  }

  /**
   * Busca documento no banco
   */
  private async getDocumentFromDatabase(documentId: string, companyId: string): Promise<any> {
    // Simular busca
    return {
      id: documentId,
      company_id: companyId,
      autentique_id: `autentique_${documentId}`,
      name: "Ata de Assembleia",
      status: "pending",
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Busca documento por ID do Autentique
   */
  private async getDocumentByAutentiqueId(autentiqueId: string): Promise<any> {
    // Simular busca
    return {
      id: `doc_${autentiqueId}`,
      autentique_id: autentiqueId,
      name: "Ata de Assembleia",
      status: "pending",
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Busca documentos no banco
   */
  private async getDocumentsFromDatabase(companyId: string, filters: any): Promise<any[]> {
    // Simular busca
    return [
      {
        id: "doc_1",
        autentique_id: "autentique_1",
        name: "Ata de Assembleia - Janeiro 2025",
        status: "completed",
        created_at: "2025-01-25T16:00:00Z",
        signers: [
          {
            id: "signer_1",
            name: "João Silva",
            email: "joao@condominio.com",
            status: "signed",
            signed_at: "2025-01-26T10:30:00Z",
          },
        ],
      },
    ];
  }
}
