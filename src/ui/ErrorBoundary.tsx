import React from "react";

// Rede de segurança GLOBAL do render. Sem isto, qualquer throw num componente derruba a árvore
// inteira e o usuário vê TELA BRANCA. Com isto, o pior caso é um aviso legível com "Recarregar".
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: unknown, info: unknown) { console.error("[ErrorBoundary]", err, info); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" style={{
        minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Montserrat,'Segoe UI',system-ui,sans-serif", color: "var(--crasto-text,#0c1a33)",
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Algo travou nesta tela</div>
          <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 18, lineHeight: 1.5 }}>
            A tela encontrou um erro e parou aqui — seus dados estão a salvo. Recarregue para continuar.
          </div>
          <button onClick={() => { this.setState({ err: null }); window.location.reload(); }} style={{
            padding: "9px 20px", borderRadius: 10, border: "1px solid rgba(110,156,232,.5)",
            background: "var(--crasto-navy,#010E26)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14,
          }}>Recarregar</button>
        </div>
      </div>
    );
  }
}
