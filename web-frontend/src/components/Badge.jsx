const URGENCY = {
  new: { cls: 'badge-new', label: 'New' },
  approaching: { cls: 'badge-approaching', label: 'Due soon' },
  overdue: { cls: 'badge-overdue', label: 'Overdue' },
};

const STATUS = {
  pending: { cls: 'badge-neutral', label: 'Pending' },
  in_progress: { cls: 'badge-new', label: 'In progress' },
  approved: { cls: 'badge-success', label: 'Approved' },
  verified: { cls: 'badge-success', label: 'Verified' },
  flagged: { cls: 'badge-danger', label: 'Flagged' },
  info_requested: { cls: 'badge-approaching', label: 'Info requested' },
  withdrawn: { cls: 'badge-neutral', label: 'Withdrawn' },
  dispatched: { cls: 'badge-new', label: 'Dispatched' },
  on_the_way: { cls: 'badge-new', label: 'On the way' },
  arrived_on_scene: { cls: 'badge-approaching', label: 'Arrived on scene' },
  completed: { cls: 'badge-success', label: 'Completed' },
  ready: { cls: 'badge-success', label: 'Hospital ready' },
};

export function UrgencyBadge({ urgency }) {
  const meta = URGENCY[urgency];
  if (!meta) return null;
  return <span className={`badge badge-dot ${meta.cls}`}>{meta.label}</span>;
}

export function StatusBadge({ status }) {
  const meta = STATUS[status] || { cls: 'badge-neutral', label: status };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}
