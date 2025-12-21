(() => {
  const $ = (sel) => document.querySelector(sel);
  const logEl = $("#log");

  const state = {
    file: null,
    fileB64: null,
    fileMp: null,
    templates: null,
  };

  function loadCfg() {
    const cfg = JSON.parse(localStorage.getItem("cg_front_cfg") || "{}");
    $("#apiUrl").value = cfg.apiUrl || "http://localhost:3000";
    $("#companyId").value = cfg.companyId || "";
    $("#userId").value = cfg.userId || "";
    $("#subject").value = cfg.subject || "auto";
    $("#dryRun").value = String(cfg.dryRun ?? "false");
    $("#companyName").value = cfg.companyName || "";
  }

  function saveCfg() {
    const cfg = {
      apiUrl: $("#apiUrl").value.trim() || "http://localhost:3000",
      companyId: $("#companyId").value.trim(),
      userId: $("#userId").value.trim(),
      subject: $("#subject").value,
      dryRun: $("#dryRun").value === "true",
      companyName: $("#companyName").value.trim(),
    };
    localStorage.setItem("cg_front_cfg", JSON.stringify(cfg));
    info("Configuração salva.");
    return cfg;
  }

  function info(msg, data) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.textContent += line + "\n";
    if (data !== undefined) {
      logEl.textContent += JSON.stringify(data, null, 2) + "\n";
    }
    logEl.scrollTop = logEl.scrollHeight;
    console.log(msg, data);
  }

  function errorLine(msg, data) {
    const line = `[${new Date().toLocaleTimeString()}] ERROR: ${msg}`;
    logEl.textContent += line + "\n";
    if (data !== undefined) {
      logEl.textContent += JSON.stringify(data, null, 2) + "\n";
    }
    logEl.scrollTop = logEl.scrollHeight;
    console.error(msg, data);
  }

  function clearLog() {
    logEl.textContent = "";
  }

  function bindUploader() {
    const drop = $("#dropzone");
    const input = $("#fileInput");

    // Click proxy
    drop.addEventListener("click", () => input.click());
    // File input
    input.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        state.file = f;
        info(`Arquivo selecionado: ${f.name} (${f.type || "sem mime"})`);
      }
    });
    // Drag and drop
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        state.file = f;
        info(`Arquivo selecionado: ${f.name} (${f.type || "sem mime"})`);
      }
    });
  }

  function bindUploaderB64() {
    const drop = $("#dropB64");
    const input = $("#fileB64");
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        state.fileB64 = f;
        info(`(base64) Arquivo selecionado: ${f.name}`);
      }
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        state.fileB64 = f;
        info(`(base64) Arquivo selecionado: ${f.name}`);
      }
    });
  }

  function bindUploaderMp() {
    const drop = $("#dropMp");
    const input = $("#fileMp");
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) {
        state.fileMp = f;
        info(`(multipart) Arquivo selecionado: ${f.name}`);
      }
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        state.fileMp = f;
        info(`(multipart) Arquivo selecionado: ${f.name}`);
      }
    });
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || "";
        // Pode vir como dataURL; manter apenas o conteúdo base64 após a vírgula
        const base64 = String(result).includes(",")
          ? String(result).split(",")[1]
          : String(result);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function doIngestAuto() {
    const cfg = saveCfg();
    if (!state.file) {
      errorLine("Selecione um arquivo antes de enviar.");
      return;
    }
    if (!cfg.companyId || !cfg.userId) {
      errorLine("Preencha x-company-id e x-user-id.");
      return;
    }
    const fileBase64 = await toBase64(state.file);
    const body = {
      fileName: state.file.name,
      fileBase64,
      subject: cfg.subject,
      options: {
        dryRun: cfg.dryRun,
        companyName: cfg.companyName || undefined,
      },
    };
    info("POST /api/documents/ingest-auto", body);
    try {
      const res = await fetch(`${cfg.apiUrl}/api/documents/ingest-auto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": cfg.companyId,
          "x-user-id": cfg.userId,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function doVerifyImport() {
    const cfg = saveCfg();
    if (!cfg.companyId) {
      errorLine("Preencha x-company-id.");
      return;
    }
    const url = `${cfg.apiUrl}/api/documents/verify-import?companyId=${encodeURIComponent(
      cfg.companyId
    )}`;
    info("GET /api/documents/verify-import", { url });
    try {
      const res = await fetch(url, {
        headers: {
          "x-company-id": cfg.companyId,
          "x-user-id": cfg.userId || "user",
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function doListSchemas() {
    const cfg = saveCfg();
    const url = `${cfg.apiUrl}/api/documents/extract/schemas`;
    info("GET /api/documents/extract/schemas", { url });
    try {
      const res = await fetch(url, {
        headers: {
          "x-company-id": cfg.companyId || "00000000-0000-0000-0000-000000000000",
          "x-user-id": cfg.userId || "user",
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function doSchemaFromTable() {
    const cfg = saveCfg();
    const table = $("#schemaTable").value.trim();
    const mode = $("#schemaMode").value;
    if (!table) {
      errorLine("Informe a tabela (ex.: condominium_units).");
      return;
    }
    const url = `${cfg.apiUrl}/api/documents/extract/schema-from-table?table=${encodeURIComponent(
      table
    )}&mode=${encodeURIComponent(mode)}`;
    info("GET /api/documents/extract/schema-from-table", { url });
    try {
      const res = await fetch(url, {
        headers: {
          "x-company-id": cfg.companyId || "00000000-0000-0000-0000-000000000000",
          "x-user-id": cfg.userId || "user",
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function loadTemplatesIfNeeded() {
    if (state.templates) return state.templates;
    const cfg = saveCfg();
    const url = `${cfg.apiUrl}/api/documents/extract/schemas`;
    info("Carregando templates…", { url });
    try {
      const res = await fetch(url, {
        headers: {
          "x-company-id": cfg.companyId || "00000000-0000-0000-0000-000000000000",
          "x-user-id": cfg.userId || "user",
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha ao carregar templates (${res.status})`, json);
        return null;
      }
      state.templates = json?.data?.templates || null;
      if (state.templates) info("Templates carregados.");
      return state.templates;
    } catch (e) {
      errorLine("Erro de rede ao carregar templates", String(e));
      return null;
    }
  }

  async function doExtractBase64() {
    const cfg = saveCfg();
    if (!cfg.companyId || !cfg.userId) {
      errorLine("Preencha x-company-id e x-user-id.");
      return;
    }
    if (!state.fileB64) {
      errorLine("Selecione um arquivo para extração (base64).");
      return;
    }
    const fileBase64 = await toBase64(state.fileB64);
    // Escolher schema: textarea > template selecionado
    let schema = null;
    const text = $("#b64Schema").value.trim();
    if (text) {
      try {
        schema = JSON.parse(text);
      } catch (e) {
        errorLine("Schema (JSON) inválido.", String(e));
        return;
      }
    } else {
      const templates = await loadTemplatesIfNeeded();
      if (!templates) {
        errorLine("Não foi possível carregar templates.");
        return;
      }
      const key = $("#b64Template").value;
      if (!key) {
        errorLine("Selecione um template ou informe um schema.");
        return;
      }
      schema = templates[key];
      if (!schema) {
        errorLine(`Template não encontrado: ${key}`);
        return;
      }
    }
    const dryRun = $("#b64DryRun").value === "true";
    const body = {
      fileName: state.fileB64.name,
      fileBase64,
      schema,
      options: { dryRun },
    };
    info("POST /api/documents/extract/base64", body);
    try {
      const res = await fetch(`${cfg.apiUrl}/api/documents/extract/base64`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": cfg.companyId,
          "x-user-id": cfg.userId,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function doExtractMultipart() {
    const cfg = saveCfg();
    if (!cfg.companyId || !cfg.userId) {
      errorLine("Preencha x-company-id e x-user-id.");
      return;
    }
    if (!state.fileMp) {
      errorLine("Selecione um arquivo (multipart).");
      return;
    }
    let schema;
    try {
      schema = JSON.parse($("#mpSchema").value.trim());
    } catch (e) {
      errorLine("Schema (JSON) inválido.", String(e));
      return;
    }
    let options = {};
    const optionsText = $("#mpOptions").value.trim();
    if (optionsText) {
      try {
        options = JSON.parse(optionsText);
      } catch (e) {
        errorLine("Options (JSON) inválido.", String(e));
        return;
      }
    }
    // O endpoint aceita dryRun dentro de options também
    const dryRun = $("#mpDryRun").value === "true";
    const mergedOptions = { ...(options || {}), dryRun };
    const form = new FormData();
    form.append("file", state.fileMp);
    form.append("schema", JSON.stringify(schema));
    form.append("options", JSON.stringify(mergedOptions));
    info("POST /api/documents/extract (multipart)", {
      schema,
      options: mergedOptions,
      file: state.fileMp.name,
    });
    try {
      const res = await fetch(`${cfg.apiUrl}/api/documents/extract`, {
        method: "POST",
        headers: {
          "x-company-id": cfg.companyId,
          "x-user-id": cfg.userId,
        },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  async function doKnowledgeStats() {
    const cfg = saveCfg();
    if (!cfg.companyId) {
      errorLine("Preencha x-company-id.");
      return;
    }
    const url = `${cfg.apiUrl}/api/documents/knowledge/stats?companyId=${encodeURIComponent(
      cfg.companyId
    )}`;
    info("GET /api/documents/knowledge/stats", { url });
    try {
      const res = await fetch(url, {
        headers: {
          "x-company-id": cfg.companyId,
          "x-user-id": cfg.userId || "user",
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorLine(`Falha (${res.status})`, json);
      } else {
        info("Sucesso:", json);
      }
    } catch (e) {
      errorLine("Erro de rede", String(e));
    }
  }

  function bindEvents() {
    $("#saveCfg").addEventListener("click", saveCfg);
    $("#clearLog").addEventListener("click", clearLog);
    $("#sendIngest").addEventListener("click", doIngestAuto);
    $("#btnVerifyImport").addEventListener("click", doVerifyImport);
    $("#btnListSchemas").addEventListener("click", doListSchemas);
    $("#btnSchemaFromTable").addEventListener("click", doSchemaFromTable);
    $("#btnExtractB64").addEventListener("click", doExtractBase64);
    $("#btnExtractMp").addEventListener("click", doExtractMultipart);
    $("#btnKnowledgeStats").addEventListener("click", doKnowledgeStats);
    // Carregar templates ao focar no select
    $("#b64Template").addEventListener("focus", loadTemplatesIfNeeded);
    // Notifications
    $("#btnRegisterToken").addEventListener("click", doRegisterPushToken);
    $("#btnSendNotification").addEventListener("click", doSendNotification);
  }

  // init
  loadCfg();
  bindUploader();
  bindUploaderB64();
  bindUploaderMp();
  bindEvents();
  info("Frontend pronto.");
})();

async function doRegisterPushToken() {
  const cfg = (function save() { return (document.querySelector("#saveCfg").click(), JSON.parse(localStorage.getItem("cg_front_cfg") || "{}")); })();
  const employeeId = document.querySelector("#notifEmployeeId").value.trim();
  const pushToken = document.querySelector("#notifPushToken").value.trim();
  const deviceId = document.querySelector("#notifDeviceId").value.trim();
  const platform = document.querySelector("#notifPlatform").value;
  if (!employeeId || !pushToken) {
    const log = document.querySelector("#log");
    log.textContent += "[register] Informe employeeId e pushToken\n";
    return;
  }
  const body = { employeeId, pushToken, deviceId: deviceId || undefined, platform };
  const url = `${cfg.apiUrl}/api/notifications/register-token`;
  const headers = {
    "Content-Type": "application/json",
    "x-company-id": cfg.companyId || "00000000-0000-0000-0000-000000000000",
    "x-user-id": cfg.userId || "admin",
  };
  const log = document.querySelector("#log");
  log.textContent += `[register] POST ${url}\n${JSON.stringify(body, null, 2)}\n`;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.textContent += `[register] ERRO (${res.status})\n${JSON.stringify(json, null, 2)}\n`;
    } else {
      log.textContent += `[register] OK\n${JSON.stringify(json, null, 2)}\n`;
    }
  } catch (e) {
    log.textContent += `[register] ERRO de rede: ${String(e)}\n`;
  }
  log.scrollTop = log.scrollHeight;
}

async function doSendNotification() {
  const cfg = (function save() { return (document.querySelector("#saveCfg").click(), JSON.parse(localStorage.getItem("cg_front_cfg") || "{}")); })();
  const employeeId = document.querySelector("#notifEmployeeId").value.trim();
  const title = document.querySelector("#notifTitle").value.trim();
  const bodyMsg = document.querySelector("#notifBody").value.trim();
  const dataText = document.querySelector("#notifData").value.trim();
  let data;
  if (dataText) {
    try { data = JSON.parse(dataText); } catch (e) {
      const log = document.querySelector("#log");
      log.textContent += `[send] Data JSON inválido: ${String(e)}\n`;
      return;
    }
  }
  if (!employeeId || !title || !bodyMsg) {
    const log = document.querySelector("#log");
    log.textContent += "[send] Informe employeeId, title e body\n";
    return;
  }
  const url = `${cfg.apiUrl}/api/notifications/send`;
  const headers = {
    "Content-Type": "application/json",
    "x-company-id": cfg.companyId || "00000000-0000-0000-0000-000000000000",
    "x-user-id": cfg.userId || "admin",
  };
  const payload = { employeeId, title, body: bodyMsg, data };
  const log = document.querySelector("#log");
  log.textContent += `[send] POST ${url}\n${JSON.stringify(payload, null, 2)}\n`;
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      log.textContent += `[send] ERRO (${res.status})\n${JSON.stringify(json, null, 2)}\n`;
    } else {
      log.textContent += `[send] OK\n${JSON.stringify(json, null, 2)}\n`;
    }
  } catch (e) {
    log.textContent += `[send] ERRO de rede: ${String(e)}\n`;
  }
  log.scrollTop = log.scrollHeight;
}


