import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, CalendarDays } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

type Card = { id: string; name: string; description: string | null; category: string | null };

// "Amplie sua operação" — recomendador de IA (DeepSeek) + 3 soluções do catálogo (sem preço) + CTAs.
// Reutilizável (Catálogo + Cockpit/Meus Resultados). Igual ao protótipo aprovado. Auto-contido.
export default function AmpliarOperacao({ orgName, ownedNames = [] }: { orgName?: string | null; ownedNames?: string[] }) {
  const t = useT();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [recoTexto, setRecoTexto] = useState("");
  const [recoBusy, setRecoBusy] = useState(false);
  const [recoRes, setRecoRes] = useState<{ recomendacao: string | null; solucoes: string[] } | null>(null);
  const [recoErr, setRecoErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const err = (e: any) => e?.message || t("Ocorreu um erro.");

  // 3 soluções do catálogo REAL que o cliente ainda NÃO tem (upsell). Sem preço.
  useEffect(() => {
    let alive = true;
    services.catalog.vdiModules.listActive("id,name,description,category").then((mods: any[]) => {
      if (!alive) return;
      const owned = new Set(ownedNames.map((n) => (n || "").toLowerCase().trim()).filter(Boolean));
      const pool = (mods || []).filter((m) => !owned.has((m.name || "").toLowerCase().trim()));
      setCards(((pool.length ? pool : mods) || []).slice(0, 3));
    }).catch(() => { });
    return () => { alive = false; };
  }, [ownedNames.join("|")]);

  async function recomendar() {
    if (recoTexto.trim().length < 5) { setRecoErr(t("Conte um pouco mais sobre o que você precisa.")); return; }
    setRecoBusy(true); setRecoErr(""); setRecoRes(null);
    try {
      const r = await services.psique.recomendar(recoTexto);
      if ((r as any)?.error) setRecoErr((r as any).error);
      else setRecoRes({ recomendacao: r.recomendacao, solucoes: r.solucoes || [] });
    } catch (e) { setRecoErr(err(e)); } finally { setRecoBusy(false); }
  }
  async function agendarReuniao() {
    setBusy(true);
    const who = profile?.full_name || profile?.email || t("Cliente");
    try {
      const r = await services.support.tickets.open({
        subject: t("Agendar reunião — Amplie sua operação"),
        description: `${t("O cliente quer agendar uma reunião para desenhar uma solução.")}\n\n${t("Solicitante")}: ${who}${profile?.email ? ` (${profile.email})` : ""}\n\n${t("Necessidade descrita")}: ${recoTexto || "—"}\n${recoRes?.solucoes?.length ? `${t("IA sugeriu")}: ${recoRes.solucoes.join(", ")}` : ""}`,
        kind: "meeting_request",
      });
      setToast(r.ok ? t("Reunião solicitada ✓ Nosso consultor vai te chamar.") : t("Não foi possível enviar. Tente de novo."));
    } catch (e) { setToast(err(e)); }
    setBusy(false); setTimeout(() => setToast(""), 8000);
  }

  const chip = { background: "rgba(110,156,232,.18)", color: "#fff", padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600 } as const;
  const btnLight = { background: "#fff", color: "var(--crasto-navy,#010E26)" } as const;

  return (
    <div style={{ background: "linear-gradient(150deg,var(--crasto-navy,#010E26),#000714)", color: "#fff", borderRadius: "var(--crasto-radius-lg,20px)", padding: "24px", marginTop: 20 }}>
      <div style={{ fontSize: 19, fontWeight: 600 }}>{t("Amplie sua operação")}</div>
      <p style={{ color: "rgba(255,255,255,.72)", fontSize: 14, marginTop: 5, maxWidth: 660 }}>
        {orgName
          ? t("Soluções do nosso catálogo que combinam com o momento da {org}. O valor é sob medida — montamos com você numa reunião, do jeito da sua empresa.", { org: orgName })
          : t("Conte o que você precisa — nossa IA recomenda a solução ideal para a sua empresa. O valor é sob medida, apresentado numa reunião.")}
      </p>

      {/* Recomendador de IA */}
      <div style={{ marginTop: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.10)", borderRadius: "var(--crasto-radius-md,14px)", padding: "16px 18px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.86)", marginBottom: 9 }}>{t("Conte o que você precisa — nossa IA recomenda a solução ideal para a sua empresa")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={recoTexto} onChange={(e) => setRecoTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") recomendar(); }} placeholder={t("Ex.: um agente que imprime boletos do meu PC conectando no sistema de seguros da empresa X")} style={{ flex: "1 1 340px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", borderRadius: "var(--crasto-radius-sm,8px)", padding: "11px 13px", color: "#fff", fontSize: 13.5, fontFamily: "inherit" }} />
          <button className="crasto-btn crasto-btn--sm" style={btnLight} disabled={recoBusy} onClick={recomendar}><span className="crasto-btn__icon"><Sparkles size={14} /></span><span className="crasto-btn__label">{recoBusy ? t("Pensando…") : t("Recomendar")}</span></button>
        </div>
        {recoErr && <div style={{ color: "#ffb4b4", fontSize: 12.5, marginTop: 8 }}>{recoErr}</div>}

        {recoRes ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-blue,#6E9CE8)", fontWeight: 600 }}>💡 {t("Nossa IA sugere")}</div>
            {recoRes.recomendacao && <p style={{ color: "rgba(255,255,255,.9)", fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{recoRes.recomendacao}</p>}
            {recoRes.solucoes.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>{recoRes.solucoes.map((s, i) => <span key={i} style={chip}>{s}</span>)}</div>}
            <button className="crasto-btn crasto-btn--sm" style={{ ...btnLight, marginTop: 14 }} disabled={busy} onClick={agendarReuniao}><span className="crasto-btn__label">{t("Agende a reunião de definição de preço")} <ArrowRight size={13} style={{ verticalAlign: -2 }} /></span></button>
          </div>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", fontWeight: 600 }}>{t("Exemplo de recomendação")}</div>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crasto-blue,#6E9CE8)", fontWeight: 600, marginTop: 8 }}>💡 {t("Nossa IA sugere")}</div>
            <p style={{ color: "rgba(255,255,255,.9)", fontSize: 14, marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>{t("Para esse caso, o ideal é combinar Consultoria de IA — implementação com Claude Code + um Agente Crasto sob medida, integrando ao seu sistema. Duas peças que trabalham juntas.")}</p>
            <button className="crasto-btn crasto-btn--sm" style={{ ...btnLight, marginTop: 12 }} disabled={busy} onClick={agendarReuniao}><span className="crasto-btn__label">{t("Agende a reunião de definição de preço")} <ArrowRight size={13} style={{ verticalAlign: -2 }} /></span></button>
          </div>
        )}
      </div>

      {/* 3 soluções do catálogo (sem preço — valor em reunião) */}
      {cards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginTop: 16 }}>
          {cards.map((c) => (
            <div key={c.id} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.10)", borderRadius: "var(--crasto-radius-md,14px)", padding: "16px 18px" }}>
              {c.category && <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", fontWeight: 600 }}>{c.category}</div>}
              <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 4 }}>{c.name}</div>
              {c.description && <p style={{ color: "rgba(255,255,255,.72)", fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>{c.description}</p>}
              <div style={{ color: "var(--crasto-blue,#6E9CE8)", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{t("Valor apresentado em reunião")}</div>
            </div>
          ))}
        </div>
      )}

      {/* CTAs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
        <button className="crasto-btn crasto-btn--sm" style={btnLight} disabled={busy} onClick={agendarReuniao}><span className="crasto-btn__icon"><CalendarDays size={14} /></span><span className="crasto-btn__label">{t("Agende uma reunião com nosso consultor")}</span></button>
        <button className="crasto-btn crasto-btn--sm" style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }} onClick={() => navigate("/app/solucoes")}><span className="crasto-btn__label">{t("Ver catálogo completo")}</span></button>
        <span style={{ color: "rgba(255,255,255,.55)", fontSize: 12.5 }}>{t("Sem compromisso — desenhamos a solução e o valor junto com você.")}</span>
      </div>
      {toast && <div style={{ marginTop: 12, fontSize: 13, color: "var(--crasto-blue,#6E9CE8)" }}>{toast}</div>}

      {/* Rodapé — assinatura da Crasto.AI */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.10)", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.9)" }}>{t("A IA é o veículo, os KPIs orientam a rota e o resultado é o destino.")}</div>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", marginTop: 4 }}>{t("Método Evolution — do Mapa à Operação · Gestão guia · Comportamento move · Resultado escala.")}</div>
      </div>
    </div>
  );
}
