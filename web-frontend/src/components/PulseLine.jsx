export default function PulseLine({ className = '' }) {
  return (
    <svg
      className={`pulse-line ${className}`}
      viewBox="0 0 400 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 10 H140 L152 10 L160 2 L170 18 L180 10 L192 10 L200 4 L206 10 H400" />
    </svg>
  );
}
