import { PageHead, Empty } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Página-base dos módulos do Console ainda em detalhamento (fundação de dados já criada:
// schemas agents/whatsapp/audit). Cada um será substituído pela tela real em sequência.
export default function ConsoleStub({ title, sub, note }: { title: string; sub: string; note: string }) {
  const t = useT();
  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒" title={title} sub={sub} />
      <div className="card"><Empty>
        <p><strong>{t("Módulo do Console — em construção.")}</strong></p>
        <p style={{ marginTop: 6, color: "var(--crasto-text-muted)" }}>{t(note)}</p>
      </Empty></div>
    </div>
  );
}
