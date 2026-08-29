// Coordenadas [lng, lat] para plotar clientes no mapa-múndi (react-simple-maps).
// Fatia 1: BR por UF (capital do estado) + países onde já há presença. Fatia 2 (futura):
// CEP/país por cliente → geocoding (ViaCEP p/ BR) substitui o centroide do estado pela cidade real.

// Capitais dos 27 estados brasileiros (long, lat).
export const UF_COORDS: Record<string, [number, number]> = {
  AC: [-67.81, -9.97], AL: [-35.73, -9.67], AP: [-51.07, 0.03], AM: [-60.02, -3.12],
  BA: [-38.51, -12.97], CE: [-38.54, -3.72], DF: [-47.86, -15.79], ES: [-40.31, -20.32],
  GO: [-49.25, -16.68], MA: [-44.30, -2.53], MT: [-56.10, -15.60], MS: [-54.62, -20.44],
  MG: [-43.94, -19.92], PA: [-48.50, -1.46], PB: [-34.86, -7.12], PR: [-49.27, -25.43],
  PE: [-34.88, -8.05], PI: [-42.80, -5.09], RJ: [-43.21, -22.91], RN: [-35.21, -5.79],
  RS: [-51.23, -30.03], RO: [-63.90, -8.76], RR: [-60.67, 2.82], SC: [-48.55, -27.59],
  SP: [-46.63, -23.55], SE: [-37.07, -10.91], TO: [-48.33, -10.18],
};

// Nome da capital por UF — rótulo do marcador (aproxima a cidade até a Fatia 2 trazer a cidade real).
export const UF_CAPITAL: Record<string, string> = {
  AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza",
  DF: "Brasília", ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande",
  MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa", PR: "Curitiba", PE: "Recife", PI: "Teresina",
  RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista",
  SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas",
};

// Países (capital/centro aproximado) — long, lat.
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  BR: [-51.93, -14.24], US: [-98.58, 39.83], PT: [-8.61, 39.5], JP: [138.25, 36.2],
  AU: [134.49, -25.73], ES: [-3.7, 40.42], GB: [-1.5, 52.5], CA: [-106.35, 56.13],
};

// Clientes INTERNACIONAIS reais — SEMENTE até a Fatia 2 (país/CEP por cliente + geocoding).
// Coordenadas por CIDADE. Verificados no site quando havia endereço: Kaikotoba (Tokyo/Roppongi),
// Matchway (Porto). Aproximados pelo estado/região informado pelo Crasto quando o site não expôs
// endereço: Silver Cactus (Nevada), Kindness & Love (Washington DC), Sushi (Flórida), Consciência
// Sistêmica (Portugal). Na Fatia 2 isso vira dado por cliente (cidade exata) e some daqui.
export const INTL_SEED: { id: string; coordinates: [number, number]; label: string; clients: string[]; tone: "active" | "negotiating" | "future" }[] = [
  // Portugal agrupa os 2 clientes num pino só (o clique mostra ambos — resolve o encavalamento).
  { id: "pt", coordinates: [-8.4, 39.8], label: "Portugal", clients: ["Matchway · Porto", "Consciência Sistêmica"], tone: "active" },
  { id: "jp", coordinates: [139.70, 35.66], label: "Tokyo · Japan", clients: ["Kaikotoba"], tone: "active" },
  { id: "us-nv", coordinates: [-115.14, 36.17], label: "Nevada · US", clients: ["Silver Cactus Jewelry"], tone: "active" },
  { id: "us-va", coordinates: [-77.19, 38.78], label: "Springfield, VA · US", clients: ["Kindness & Love Transportation"], tone: "active" },
  { id: "us-fl", coordinates: [-80.35, 25.82], label: "Doral, FL · US", clients: ["NacionSushi"], tone: "active" },
];
