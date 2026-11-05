import { CITY_BOX, STREETS } from './city';

/**
 * Opening screen: a static, lightweight illustrated city (one cached SVG image). Only the small
 * car and its turquoise line move, in CSS: no script, no map data, no WebGL.
 */
export function HeroCity() {
  return (
    <>
      <div className="tilt" aria-hidden="true">
        <svg className="hero-city" viewBox="-90 -90 1330 880" preserveAspectRatio="xMidYMid slice">
          <image
            href="/illustrations/city-hero.svg"
            x={CITY_BOX.x}
            y={CITY_BOX.y}
            width={CITY_BOX.width}
            height={CITY_BOX.height}
            preserveAspectRatio="none"
          />
          <path className="hero-trace" pathLength={100} d="M-80 235H860V-90" />
          <g className="hero-car">
            <g transform="rotate(90) translate(-11 -15) scale(.22 .15)">
              <rect x="4" y="38" width="12" height="30" rx="4" fill="#050B14" />
              <rect x="84" y="38" width="12" height="30" rx="4" fill="#050B14" />
              <rect x="4" y="136" width="12" height="32" rx="4" fill="#050B14" />
              <rect x="84" y="136" width="12" height="32" rx="4" fill="#050B14" />
              <path d="M50 3C72 3 86 11 88 34L90 92 89 158C88 184 75 197 50 197S12 184 11 158L10 92 12 34C14 11 28 3 50 3Z" fill="#fff" stroke="#3FE0D0" strokeWidth="5" />
              <path d="M20 68C30 56 70 56 80 68L74 94C60 88 40 88 26 94Z" fill="#12284A" />
              <path d="M24 142C40 146 60 146 76 142L82 164C66 174 34 174 18 164Z" fill="#12284A" />
              <path d="M15 25C20 13 30 9 39 8L31 25Z" fill="#FFE9B0" />
              <path d="M85 25C80 13 70 9 61 8L69 25Z" fill="#FFE9B0" />
            </g>
          </g>
        </svg>
      </div>
      <div className="plaque hero-plaque enter" style={{ '--i': 3 } as React.CSSProperties} aria-hidden="true">
        <b>{STREETS.bourguiba.ar}</b>
        <em>{STREETS.bourguiba.fr}</em>
      </div>
    </>
  );
}
