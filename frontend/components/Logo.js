/**
 * Apartment-building mark for the Apartments side — same disc treatment
 * and size as `GymMark` so switching businesses feels like one family.
 */
export function BuildingMark({ size = 40, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill="#064e3b" />
      <circle cx="32" cy="32" r="27.25" fill="none" stroke="#34d399" strokeWidth="2.5" opacity="0.9" />

      {/* tall tower */}
      <rect x="27" y="16" width="21" height="34" rx="3" fill="#ffffff" />
      {/* low wing */}
      <rect x="16" y="26" width="12" height="24" rx="3" fill="#ffffff" opacity="0.92" />

      {/* tower windows */}
      <g fill="#064e3b">
        <rect x="31" y="21" width="5" height="5" rx="1" />
        <rect x="39" y="21" width="5" height="5" rx="1" />
        <rect x="31" y="30" width="5" height="5" rx="1" />
        <rect x="39" y="30" width="5" height="5" rx="1" />
        <rect x="31" y="39" width="5" height="5" rx="1" />
        <rect x="39" y="39" width="5" height="5" rx="1" />
      </g>
      {/* wing windows */}
      <g fill="#064e3b" opacity="0.85">
        <rect x="19" y="31" width="5" height="5" rx="1" />
        <rect x="19" y="40" width="5" height="5" rx="1" />
      </g>
      {/* doorway */}
      <rect x="33.5" y="44" width="8" height="6" rx="1.5" fill="#064e3b" opacity="0.85" />
    </svg>
  );
}

/**
 * Fist gripping a barbell mark — pure inline SVG so no image asset or
 * network font is required at build time.
 */
export function GymMark({ size = 40, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill="#064e3b" />
      <circle cx="32" cy="32" r="27.25" fill="none" stroke="#34d399" strokeWidth="2.5" opacity="0.9" />

      {/* barbell bar */}
      <rect x="9" y="29.75" width="46" height="4.5" rx="2.25" fill="#ffffff" />

      {/* outer + inner plates */}
      <rect x="7.5" y="22" width="6.5" height="20" rx="3.25" fill="#ffffff" />
      <rect x="50" y="22" width="6.5" height="20" rx="3.25" fill="#ffffff" />
      <rect x="16" y="25.5" width="4" height="13" rx="2" fill="#ffffff" />
      <rect x="44" y="25.5" width="4" height="13" rx="2" fill="#ffffff" />

      {/* fist wrapping the bar */}
      <rect x="22" y="20.5" width="20" height="23" rx="7" fill="#ffffff" />
      <path
        d="M25.2 27.5h13.6M25.2 31.5h13.6M25.2 35.5h13.6"
        stroke="#064e3b"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* thumb wrapping across the front */}
      <rect
        x="19.5"
        y="34.5"
        width="12.5"
        height="6.5"
        rx="3.25"
        fill="#ffffff"
        stroke="#064e3b"
        strokeWidth="1.4"
        transform="rotate(-8 25.75 37.75)"
      />
    </svg>
  );
}
