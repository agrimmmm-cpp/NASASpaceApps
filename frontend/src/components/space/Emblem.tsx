// Original mission-patch emblem (not any agency insignia).
export function Emblem({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden
      style={{ filter: "drop-shadow(0 0 8px rgba(255,200,61,0.45))" }}>
      <ellipse cx="18" cy="18" rx="15" ry="7" stroke="#FFC83D" strokeDasharray="1.5 2.5" strokeWidth="1.3" transform="rotate(-28 18 18)" />
      <ellipse cx="18" cy="18" rx="15" ry="7" stroke="#3DD9FF" strokeWidth="0.9" opacity="0.8" transform="rotate(32 18 18)" />
      <circle cx="18" cy="18" r="14" stroke="#FFC83D" strokeWidth="1.3" />
      <path d="M18 9C18 9 22 14.5 22 18.5C22 20.7 20.2 22.5 18 22.5C15.8 22.5 14 20.7 14 18.5C14 14.5 18 9 18 9Z" fill="#FFB873" />
      <circle cx="18" cy="19" r="2.5" fill="#3DD9FF" />
    </svg>
  );
}
