export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <div className="phead">
        <div className="ey">Portal do Cliente</div>
        <h1>{title}</h1>
      </div>
      <div className="empty">
        <p><strong>Em construção.</strong> Esta tela faz parte do escopo aprovado e entra nas próximas etapas do frontend.</p>
      </div>
    </div>
  );
}
