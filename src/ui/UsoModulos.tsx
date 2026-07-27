import { useState } from "react";
import { Clock } from "lucide-react";
import { services } from "../services";
import { Pill, useAsync, useSort, SortTh } from "./ui";
import { useT } from "../lib/i18n";

/**
 * USO DOS MÓDULOS — quem abriu o quê, quantas vezes e por quanto tempo.
 *
 * Mesmo componente nos dois lugares: no admin (passando `orgId` do cliente) e no Portal do
 * cliente (sem `orgId` → a RLS resolve). Quem pode ver o quê NÃO é decidido aqui: o dono
 * enxerga a equipe, o membro só o próprio uso, o crasto_admin vê tudo — regra que mora nas
 * policies de `delivery.module_sessions`. Esta tela só desenha o que o banco deixou passar.
 *
 * Honestidade do número: a duração vem de `ended_at` quando a pessoa saiu pela tela, e de
 * `last_seen_at` (pulso de 1 min) quando fechou a aba no tapa. Nunca de "agora" — sessão
 * esquecida aberta não pode virar 8 horas de uso.
 */
export default function UsoModulos({ orgId, titulo }: { orgId?: string; titulo?: string }) {
  const t = useT();
  const [dias, setDias] = useState(30);
  const { data, loading } = useAsync(() => services.delivery.moduleSessions.summary(dias, orgId), [dias, orgId]);
  const { sort, toggle, sorted } = useSort("aberturas", -1);
  const linhas: any[] = sorted(Array.isArray(data) ? data : [], (r, col) => {
    switch (col) {
      case "usuario": return r.full_name || r.email || "";
      case "modulo": return r.modulo;
      case "aberturas": return r.aberturas;
      case "tempo": return r.segundos;
      case "ultimo": return r.ultimo_acesso;
      default: return r.aberturas;
    }
  });

  const tempo = (s: number) => {
    const seg = Math.max(0, Number(s) || 0);
    if (seg < 60) return `${seg}s`;
    const min = Math.round(seg / 60);
    if (min < 60) return `${min}min`;
    return `${Math.floor(min / 60)}h ${min % 60}min`;
  };
  const quando = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
    if (h < 1) return t("agora há pouco");
    if (h < 24) return t("há {n}h", { n: h });
    return d.toLocaleDateString();
  };

  return (
    <>
      <div className="sec-h" style={{ marginTop: 24 }}>
        <h2>{titulo || t("Uso dos módulos por usuário")}</h2>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} style={{ marginLeft: "auto", minWidth: 130 }}>
          <option value={7}>{t("últimos 7 dias")}</option>
          <option value={30}>{t("últimos 30 dias")}</option>
          <option value={90}>{t("últimos 90 dias")}</option>
        </select>
      </div>
      {loading ? (
        <div className="mt" style={{ padding: "4px 2px" }}>{t("Carregando…")}</div>
      ) : linhas.length === 0 ? (
        // Sem dado é sem dado: não inventamos número. Só módulo aberto DENTRO do Portal
        // gera medição — o que abre em nova aba sai do nosso alcance e a tela diz isso.
        <div className="mt" style={{ padding: "4px 2px" }}>
          {t("Nenhum acesso registrado no período.")}{" "}
          {t("Só é medido o módulo configurado para abrir dentro do Portal.")}
        </div>
      ) : (
        <table className="tbl">
          <thead><tr>
            <SortTh col="usuario" sort={sort} toggle={toggle}>{t("Usuário")}</SortTh>
            <SortTh col="modulo" sort={sort} toggle={toggle}>{t("Módulo")}</SortTh>
            <SortTh col="aberturas" sort={sort} toggle={toggle} right>{t("Aberturas")}</SortTh>
            <SortTh col="tempo" sort={sort} toggle={toggle} right>{t("Tempo")}</SortTh>
            <SortTh col="ultimo" sort={sort} toggle={toggle}>{t("Último acesso")}</SortTh>
          </tr></thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={`${r.user_id}-${r.client_module_id}`}>
                <td>{r.full_name || r.email || "—"}</td>
                <td>{r.modulo}</td>
                <td style={{ textAlign: "right" }}>{r.aberturas}</td>
                <td style={{ textAlign: "right" }}>
                  <Pill tone="info"><Clock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />{tempo(r.segundos)}</Pill>
                </td>
                <td>{quando(r.ultimo_acesso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
