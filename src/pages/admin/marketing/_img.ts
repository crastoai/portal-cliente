/**
 * Preparo de imagem antes de subir (Brand Kit e Imagens & Carrossel usam os dois).
 *
 * Por que existe: foto de celular tem 4-8 MB e print de tela chega como PNG.
 * PNG não comprime foto — reencodar PNG em PNG devolvia referências de 1,5 a
 * 2 MB, o pedido ao motor de imagem estourava e a arte voltava erro 500. Uma
 * referência só precisa passar o CLIMA (luz, textura, composição): 1024px em
 * JPEG resolve com ~80 KB. Só o logo precisa de PNG, pela transparência.
 */
export const MAX_LADO = 1600;
export const MAX_LADO_REF = 1024;

export function encolher(dataUrl: string, mime: string, lado = MAX_LADO, jpeg = false): Promise<string> {
  const jaLeve = dataUrl.length < 300_000;
  if (/svg/i.test(mime) || (jaLeve && !(jpeg && /png/i.test(mime)))) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * escala); cv.height = Math.round(img.height * escala);
      const ctx = cv.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      // JPEG não tem transparência: pinta branco antes, senão o transparente
      // vira preto e a referência muda de clima
      if (jpeg || !/png/i.test(mime)) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const saida = jpeg || !/png/i.test(mime) ? cv.toDataURL("image/jpeg", 0.82) : cv.toDataURL("image/png");
      resolve(saida.length < dataUrl.length ? saida : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Lê um File como dataURL. */
export function lerArquivo(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

/** Arquivo → referência pronta para enviar (1024px, JPEG). */
export async function prepararReferencia(f: File): Promise<string> {
  return encolher(await lerArquivo(f), f.type, MAX_LADO_REF, true);
}
