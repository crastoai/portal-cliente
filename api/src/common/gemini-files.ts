// ── Gemini File API ────────────────────────────────────────────────────────────────────
// Sobe um arquivo PESADO para o Google e devolve um `file_uri`, que substitui o
// `inline_data` (base64 embutido no request, com teto de ~20MB). Com o file_uri o arquivo
// NÃO viaja dentro do generateContent → o teto de 20MB deixa de existir (aguenta até 2GB
// por arquivo). O arquivo fica ~48h no Google e é de graça.
//
// SÓ é chamado quando há ARQUIVO (documento/áudio/vídeo/imagem) — nunca em texto puro.
const BASE = 'https://generativelanguage.googleapis.com';

export type GeminiFile = { uri: string; mimeType: string };

/** Faz upload resumível e espera ficar ACTIVE (áudio/vídeo passam por PROCESSING). */
export async function uploadGeminiFile(apiKey: string, bytes: Buffer, mime: string, displayName = 'arquivo'): Promise<GeminiFile> {
  const tipo = mime || 'application/octet-stream';
  // 1) inicia o upload resumível (chave no HEADER, nunca na URL — url vaza em log)
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': tipo,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) throw new Error(`Gemini File API (start) ${start.status}: ${(await start.text().catch(() => '')).slice(0, 160)}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini File API não devolveu a URL de upload.');

  // 2) envia os bytes e finaliza
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: new Uint8Array(bytes),
  });
  const j: any = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`Gemini File API (upload) ${up.status}: ${JSON.stringify(j?.error || j).slice(0, 160)}`);
  let file = j?.file || j;
  if (!file?.uri) throw new Error('Gemini File API não devolveu o file_uri.');

  // 3) imagem/PDF já vêm ACTIVE; áudio/vídeo entram em PROCESSING e só podem ser usados
  //    depois de processados. Poll curto (o worker processa mídia em segundo plano).
  let tentativas = 0;
  while (file.state === 'PROCESSING' && tentativas < 30) {
    await new Promise((r) => setTimeout(r, 2000));
    const nome = String(file.name || '').replace(/^files\//, '');
    const st = await fetch(`${BASE}/v1beta/files/${nome}`, { headers: { 'x-goog-api-key': apiKey } });
    file = await st.json().catch(() => file);
    tentativas++;
  }
  if (file.state && file.state !== 'ACTIVE') throw new Error(`Gemini File API: arquivo ficou em ${file.state} (não pronto p/ uso).`);
  return { uri: file.uri, mimeType: file.mimeType || tipo };
}
