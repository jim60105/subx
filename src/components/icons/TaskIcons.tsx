/** Line icons for the home hub task cards. Sized by the card, coloured by `currentColor`. */

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function MatchIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="4" width="8" height="7" rx="1.5" />
      <rect x="13.5" y="13" width="8" height="7" rx="1.5" />
      <path d="M10.5 7.5h4a3 3 0 0 1 3 3v2.5" />
      <path d="m15.5 11.5 2 1.5-2 1.5" />
    </svg>
  );
}

export function ConvertIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 8h13l-2.5-2.5" />
      <path d="M20 16H7l2.5 2.5" />
    </svg>
  );
}

export function SyncIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12h2l1.5-5 2 10 2-7 1.5 4 1.5-2H21" />
    </svg>
  );
}

export function TranslateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 5.5h8" />
      <path d="M7.5 4v1.5" />
      <path d="M9.5 5.5c0 3.2-2.5 6-6 7" />
      <path d="M5.5 8.5c.9 2.2 2.6 3.6 4.5 4.3" />
      <path d="m12.5 20 4-9 4 9" />
      <path d="M13.9 17h5.2" />
    </svg>
  );
}
