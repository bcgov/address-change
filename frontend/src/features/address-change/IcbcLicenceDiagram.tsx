import type { FC } from 'react'

const NAVY = '#003366'
const BLUE = '#1E5189'
const GOLD = '#FDC63D'

/** Illustration of a BC driver's licence with arrows to the licence number, height and weight. */
const IcbcLicenceDiagram: FC = () => (
  <svg
    aria-labelledby="licence-diagram-title licence-diagram-desc"
    className="licence-diagram"
    role="img"
    viewBox="0 0 640 270"
  >
    <title id="licence-diagram-title">Where to find your details on a BC driver’s licence</title>
    <desc id="licence-diagram-desc">
      The licence number is at the top right of the front of the licence. Your weight and height are
      printed together on one line in the middle, beside your photo.
    </desc>
    <defs>
      <marker
        id="licence-arrow"
        markerHeight="12"
        markerUnits="userSpaceOnUse"
        markerWidth="14"
        orient="auto"
        refX="11"
        refY="6"
      >
        <path d="M0 0 L14 6 L0 12 Z" fill={GOLD} />
      </marker>
    </defs>

    <rect fill={BLUE} height="210" rx="16" width="360" x="42" y="42" />
    <rect fill={NAVY} height="210" rx="16" width="360" x="30" y="30" />

    <g fill="#FFFFFF" fontWeight="700">
      <text fontSize="13" letterSpacing="1" x="50" y="58">
        DRIVER’S LICENCE
      </text>
      <text fontSize="20" x="50" y="82">
        British Columbia
      </text>
      <text fontSize="20" textAnchor="end" x="382" y="82">
        CAN
      </text>
    </g>

    <path d="M44 220 C44 168 66 144 98 144 C130 144 152 168 152 220 Z" fill="#FFFFFF" />
    <circle cx="98" cy="118" fill={NAVY} r="33" />
    <circle cx="98" cy="118" fill="#FFFFFF" r="25" />

    <text fill="#FFFFFF" fontSize="17" fontWeight="700" x="220" y="112">
      DL: 1234562
    </text>
    <g fill="#FFFFFF">
      <rect height="8" width="170" x="170" y="126" />
      <rect height="8" width="130" x="170" y="138" />
      <rect height="8" width="150" x="170" y="198" />
      <rect height="8" width="110" x="170" y="212" />
    </g>
    <g fill="#FFFFFF" fontSize="16" fontWeight="700">
      <text x="170" y="188">
        Wt 51 kg
      </text>
      <text x="262" y="188">
        Ht 175 cm
      </text>
    </g>

    <g fill="none" stroke={GOLD} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4">
      <path d="M440 107 H346" markerEnd="url(#licence-arrow)" />
      <path d="M440 183 H356" markerEnd="url(#licence-arrow)" />
    </g>

    <g fill={BLUE} fontSize="16" fontWeight="700">
      <text x="452" y="112">
        Drivers license number
      </text>
      <text x="452" y="188">
        Weight &amp; Height
      </text>
    </g>
  </svg>
)

export default IcbcLicenceDiagram
