import { Plug } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, useAsync } from "../../ui/ui";

type Integ = { key: string; display_name: string; status: string };

export default function Integracoes() {
  const { data } = useAsync(async () => (await supabase.schema("automation").from("integrations").select("key,display_name,status").order("display_name")).data as Integ[], []);
  const items = data ?? [];
  const tone = (s: string) => (s === "connected" ? "ok" : s === "error" ? "warn" : "mute");
  const label = (s: string) => (s === "connected" ? "Conectado" : s === "error" ? "Ação necessária" : "Desconectado");

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Integrações & pagamentos" sub="Conecte as tecnologias que o portal usa." />
      <div className="assign">
        {items.map((i) => (
          <div className="arow" key={i.key}>
            <span className="ico" style={{ background: i.status === "connected" ? "#1F8A5B" : "var(--crasto-navy)" }}><Plug size={16} /></span>
            <span><span className="t">{i.display_name}</span><br /><span className="s">{i.key}</span></span>
            <Pill tone={tone(i.status)}>{label(i.status)}</Pill>
          </div>
        ))}
      </div>
      <div className="note" style={{ marginTop: 22 }}><span>Gateway de pagamento escolhido: <b>Asaas</b> (menor taxa para Pix/boleto no Brasil). <b>Autentique</b> conectada para contratos.</span></div>
    </div>
  );
}
