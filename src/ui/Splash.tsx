// Splash de tela cheia — a logo Crasto ao centro, animada. Usado no boot do app
// (enquanto a sessão/perfil carrega) no lugar do "Carregando…" solto no canto.
// A logo é o MESMO monograma do favicon (puxa a peça, não recria); o traço usa
// currentColor, então herda a cor de marca do tema.
export default function Splash({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="brand-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="brand-splash__stage">
        <div className="brand-splash__ring" aria-hidden="true" />
        <svg className="brand-splash__mark" viewBox="361 473 1424 1424" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
          fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1431.364,673.898c-236.427,-165.677 -620.238,-104.452 -794.386,144.293c-215.195,307.374 -109.678,650.466 80.625,818.5c180.181,159.095 482.664,215.644 724.788,63.247" strokeWidth="86.74" />
          <path d="M802.621,1695.817l564.117,-812.093" strokeWidth="84.44" />
          <path d="M1461.997,903.802l2.095,69.656l-0.141,560.024" strokeWidth="84.54" />
          <rect x="1383.061" y="878.933" width="50.488" height="21.821" strokeWidth="41.67" strokeMiterlimit="1.5" />
          <path d="M1354.134,866.19c2.422,-2.052 26.239,-20.647 73.512,-14.561c5.527,0.712 9.746,1.219 12.591,2.174c9.42,3.16 20.595,9.767 28.429,18.672c11.637,13.228 17.571,29.338 12.936,29.044c-6.231,-0.394 -1.941,-2.099 -54.665,-18.6c-25.718,-8.049 -38.072,-1.688 -62.17,-10.169c-12.982,-4.569 -11.286,-6.006 -10.633,-6.56Z" strokeWidth="41.67" strokeMiterlimit="1.5" />
          <path d="M1624.606,874.719c0.287,31.495 1.219,137.307 1.587,222.084c0.452,104.294 0.975,224.013 1.232,279.42c0.276,59.38 0.684,157.453 0.684,157.453" strokeWidth="79.17" />
        </svg>
      </div>
      <div className="brand-splash__word">{label}</div>
    </div>
  );
}
