// Campos REAIS de configuração por provedor de integração.
// kind: 'text' → guardado em meta (não-secreto, exibido em texto)
//       'from' → guardado na coluna from_addr (URL/remetente, não-secreto)
//       'secret' → segredo; o marcado primary vai na coluna `secret` (compat com o runtime),
//                  os demais vão em `secrets` (jsonb). NUNCA retornam ao navegador (só "salvo").
export type IntegField = { key: string; label: string; kind: "text" | "from" | "secret"; primary?: boolean; placeholder?: string };

export const INTEGRATION_FIELDS: Record<string, IntegField[]> = {
  anthropic: [{ key: "api_key", label: "API Key de INFERÊNCIA (Anthropic)", kind: "secret", primary: true, placeholder: "sk-ant-api..." }],
  openai: [{ key: "api_key", label: "API Key de INFERÊNCIA (OpenAI)", kind: "secret", primary: true, placeholder: "sk-... / sk-proj-..." }],
  // Chaves de ADMIN/billing (custo de IA) — DIFERENTES das de inferência acima.
  anthropic_admin: [{ key: "api_key", label: "Admin API Key (custo/billing) — Anthropic", kind: "secret", primary: true, placeholder: "sk-ant-admin01-..." }],
  openai_admin: [{ key: "api_key", label: "Admin API Key (custo/billing) — OpenAI", kind: "secret", primary: true, placeholder: "sk-admin-... (escopo api.usage.read)" }],
  google: [{ key: "api_key", label: "API Key (Google AI Studio)", kind: "secret", primary: true, placeholder: "AIza..." }],
  elevenlabs: [{ key: "api_key", label: "API Key (ElevenLabs)", kind: "secret", primary: true }],
  autentique: [{ key: "api_token", label: "API Token (Autentique)", kind: "secret", primary: true }],
  asaas: [{ key: "api_key", label: "API Key (Asaas)", kind: "secret", primary: true }],
  stripe: [{ key: "secret_key", label: "Secret Key (Stripe)", kind: "secret", primary: true, placeholder: "sk_live_..." }],
  resend_email: [
    { key: "api_key", label: "API Key (Resend)", kind: "secret", primary: true, placeholder: "re_..." },
    { key: "from", label: "Remetente (from)", kind: "from", placeholder: "Crasto.AI <no-reply@crasto.ai>" },
  ],
  ai_bridge: [
    { key: "url", label: "URL da ponte", kind: "from", placeholder: "https://ponte.crasto.ai/assist" },
    { key: "shared_secret", label: "Segredo compartilhado (PONTE_SECRET)", kind: "secret", primary: true },
  ],
  cloudflare_r2: [
    { key: "account_id", label: "Account ID", kind: "text" },
    { key: "access_key_id", label: "Access Key ID", kind: "text" },
    { key: "secret_access_key", label: "Secret Access Key", kind: "secret", primary: true },
    { key: "bucket", label: "Bucket", kind: "text", placeholder: "crasto-documentos" },
    { key: "endpoint", label: "Endpoint (S3 API)", kind: "text", placeholder: "https://<account>.r2.cloudflarestorage.com" },
  ],
  banco_inter: [
    { key: "base_url", label: "URL base da API", kind: "text", placeholder: "https://cdpj.partners.bancointer.com.br" },
    { key: "conta_corrente", label: "Conta corrente", kind: "text" },
    { key: "client_id", label: "Client ID", kind: "text" },
    { key: "client_secret", label: "Client Secret", kind: "secret", primary: true },
    { key: "cert_pem", label: "Certificado mTLS (.crt/.pem)", kind: "secret" },
    { key: "key_pem", label: "Chave privada (.key)", kind: "secret" },
  ],
  whatsapp_official: [
    { key: "phone_number_id", label: "Phone Number ID", kind: "text" },
    { key: "waba_id", label: "WhatsApp Business Account ID", kind: "text" },
    { key: "access_token", label: "Access Token", kind: "secret", primary: true },
    { key: "verify_token", label: "Verify Token (webhook)", kind: "secret" },
  ],
};

export const HINTS: Record<string, string> = {
  anthropic_admin: "Chave de ADMIN da Anthropic (sk-ant-admin01-…) — DIFERENTE da de inferência (sk-ant-api…). Só o dono da organização cria: Console → Settings → Organization → Admin keys. Serve para puxar o CUSTO REAL de IA (aba Custo de IA → Sincronizar custos).",
  openai_admin: "Chave de ADMIN da OpenAI com escopo api.usage.read — DIFERENTE da de inferência/projeto (sk-proj-…). Criada pelo dono: Settings → Organization → Admin keys. Serve para puxar o CUSTO REAL de IA (aba Custo de IA → Sincronizar custos).",
  resend_email: "Chave do Resend (re_...). Para enviar de no-reply@crasto.ai, verifique o domínio no Resend.",
  ai_bridge: "Liga o chat/voz da proposta ao Claude Max. Rode a ponte e cole a URL + o mesmo PONTE_SECRET. Ver PONTE_CLAUDE_MAX_Setup.md.",
  banco_inter: "Faturamento Pix/boleto. O Inter exige certificado mTLS — o cert/chave ficam no cofre e o serviço roda na VPS.",
  cloudflare_r2: "Bucket R2 para documentos. Endpoint no formato https://<account>.r2.cloudflarestorage.com.",
  whatsapp_official: "WhatsApp Cloud API (Meta): phone_number_id, WABA ID, access token e verify token do webhook.",
};

export const fieldsFor = (key: string): IntegField[] => INTEGRATION_FIELDS[key] ?? [{ key: "api_key", label: "Chave / segredo", kind: "secret", primary: true }];

// Integrações cujas credenciais vivem no AMBIENTE DO SERVIDOR (edge secrets), não no banco.
// A arquitetura pede segredo fora do código — estas já seguem esse padrão. Mapeia key → env vars.
export const SERVER_MANAGED: Record<string, string[]> = {
  cloudflare_r2: ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_KEY"],
  autentique: ["AUTENTIQUE_TOKEN"],
};
