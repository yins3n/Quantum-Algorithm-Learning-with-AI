import "./NotebookCard.css";

function NotebookCard({ label = "OUTPUT", title, meta, children, className = "" }) {
  return (
    <article className={`notebook-card ${className}`}>
      <div className="notebook-card-gutter" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="notebook-card-content">
        <div className="notebook-card-heading">
          <div>
            <span className="notebook-cell-label">{label}</span>
            {title && <h3>{title}</h3>}
          </div>
          {meta && <span className="notebook-card-meta">{meta}</span>}
        </div>
        <div className="notebook-card-body">{children}</div>
      </div>
    </article>
  );
}

export default NotebookCard;
