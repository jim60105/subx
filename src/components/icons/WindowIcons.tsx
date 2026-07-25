/** Line icons for custom titlebar window controls. Coloured by `currentColor`. */

const windowIconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function MinimizeIcon() {
  return (
    <svg {...windowIconProps}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function MaximizeIcon() {
  return (
    <svg {...windowIconProps}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
    </svg>
  );
}

export function RestoreIcon() {
  return (
    <svg {...windowIconProps}>
      <path d="M9 5h10a1 1 0 0 1 1 1v10" />
      <rect x="4" y="9" width="11" height="11" rx="1.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...windowIconProps}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
