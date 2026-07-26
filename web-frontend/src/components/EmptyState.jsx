export default function EmptyState({ title, message, icon = null }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
    </div>
  );
}
