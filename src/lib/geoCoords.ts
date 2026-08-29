// Localização dos clientes no mapa-múndi (react-simple-maps) — plotado por CIDADE real.
// SEMENTE curada até a Fatia 2 (campo cidade/CEP por cliente no banco + geocoding ViaCEP).

// Coordenadas por CIDADE (long, lat).
export const CITY_COORDS: Record<string, [number, number]> = {
  "São Paulo": [-46.63, -23.55], "Ribeirão Preto": [-47.81, -21.18], "Guarulhos": [-46.53, -23.46],
  "Recife": [-34.88, -8.05], "Rio de Janeiro": [-43.21, -22.91], "Barueri": [-46.88, -23.51],
  "Tokyo": [139.70, 35.66], "Porto": [-8.61, 41.15], "Portugal": [-8.4, 39.8],
  "Nevada": [-115.14, 36.17], "Springfield, VA": [-77.19, 38.78], "Doral, FL": [-80.35, 25.82],
};

// Clientes REAIS (com contrato/pagamento) e onde estão — fonte: pastas `Clients/` (coleta 2026-08-29
// lendo contratos/CONTEXTO de cada cliente) + internacionais confirmados pelo Crasto (LOIs EB2-NIW).
// Só ATIVOS aqui (prospects ficam de fora). `city` casa com CITY_COORDS; `uf` VAZIO quando o `city`
// já é país/estado ou já embute a sigla (evita "Nevada · NV" / "Doral, FL · FL" redundantes).
// El Shadai: cidade exata não consta no contrato → aproximado em SP (o nome revela "interior SP").
export const CLIENTS_GEO: { client: string; city: string; uf: string; country: string }[] = [
  { client: "Carneiro de Souza · Dr Francisco", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "SR Brasil Corretora", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "FLSS Advogados", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "JJ Serviços de Terceirização", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "Dr Hugo Doria · CDN", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "Lavve.me", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "Grupo El Shadai · interior SP", city: "São Paulo", uf: "SP", country: "BR" },
  { client: "Connect Solar", city: "Ribeirão Preto", uf: "SP", country: "BR" },
  { client: "Kaikotoba", city: "Tokyo", uf: "", country: "JP" },
  { client: "Matchway", city: "Porto", uf: "", country: "PT" },
  { client: "Consciência Sistêmica · Dr Fernando", city: "Portugal", uf: "", country: "PT" },
  { client: "Silver Cactus Jewelry", city: "Nevada", uf: "", country: "US" },
  { client: "Kindness & Love Transportation", city: "Springfield, VA", uf: "", country: "US" },
  { client: "NacionSushi", city: "Doral, FL", uf: "", country: "US" },
];
