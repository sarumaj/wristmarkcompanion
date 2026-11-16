// The sun's and the moon's positions from the time alone, for the moon phase and the
// globe with day and night: low-precision formulas, good to a fraction of a degree
// for the sun and to within an hour or so for the moon's phases, which is plenty for
// a model a few centimeters wide. No location, no network.
//
// The sun: the Astronomical Almanac's low-precision formulas (as in Meeus,
// "Astronomical Algorithms", chapter 25, and the USNO's approximate solar
// coordinates). The moon: the main periodic terms of its longitude (Meeus,
// chapter 47); its phase from its elongation from the sun.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
// Julian date of the Unix epoch, and of J2000.0.
const JD_UNIX = 2440587.5;
const J2000 = 2451545.0;

function wrap360(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function wrap180(degrees) {
  return wrap360(degrees + 180) - 180;
}

// Days since J2000.0 (Universal Time; the difference to Terrestrial Time, about a
// minute, is below these formulas' precision).
function days(date) {
  return date.getTime() / DAY_MS + JD_UNIX - J2000;
}

// The sun's apparent ecliptic longitude, in degrees.
function sunLongitude(n) {
  const g = (357.528 + 0.9856003 * n) * RAD;
  return wrap360(280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

// The point on Earth where the sun is overhead at `date`: {latitude, longitude} in
// degrees, longitude east positive.
export function subsolarPoint(date) {
  const n = days(date);
  const lambda = sunLongitude(n) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  // Greenwich mean sidereal time, in degrees.
  const gmst = 280.46061837 + 360.98564736629 * n;
  return { latitude: declination / RAD, longitude: wrap180(rightAscension - gmst) };
}

// The moon's ecliptic longitude, in degrees.
function moonLongitude(n) {
  const t = n / 36525;
  const d = (297.8501921 + 445267.1114034 * t) * RAD;
  const m = (357.5291092 + 35999.0502909 * t) * RAD;
  const mm = (134.9633964 + 477198.8675055 * t) * RAD;
  const f = (93.272095 + 483202.0175233 * t) * RAD;
  return wrap360(
    218.3164477 +
      481267.88123421 * t +
      6.288774 * Math.sin(mm) +
      1.274027 * Math.sin(2 * d - mm) +
      0.658314 * Math.sin(2 * d) +
      0.213618 * Math.sin(2 * mm) -
      0.185116 * Math.sin(m) -
      0.114332 * Math.sin(2 * f),
  );
}

// The moon's elongation east of the sun, 0-360 degrees: 0 new, 90 first quarter,
// 180 full, 270 last quarter.
export function moonElongation(date) {
  const n = days(date);
  return wrap360(moonLongitude(n) - sunLongitude(n));
}

// The moon's phase at `date`: its elongation, the lit share of its disk (0-1), and
// whether it's waxing (lit on the right, seen from the northern hemisphere).
export function moonPhase(date) {
  const elongation = moonElongation(date);
  return {
    elongation,
    illumination: (1 - Math.cos(elongation * RAD)) / 2,
    waxing: elongation < 180,
  };
}

// The next time after `date` the elongation reaches `target` degrees (0 new moon,
// 180 full moon): stepped by six hours (the elongation grows about 12 degrees a
// day, never backwards), then halved down to a minute.
export function nextElongation(date, target) {
  const ahead = (time) => wrap360(target - moonElongation(new Date(time)));
  const step = DAY_MS / 4;
  let low = date.getTime();
  let gap = ahead(low);
  for (let i = 0; i < 4 * 31; i++) {
    const next = low + step;
    const nextGap = ahead(next);
    if (nextGap > gap) {
      // The gap wrapped around: the target was crossed between low and next.
      let high = next;
      while (high - low > 60000) {
        const middle = (low + high) / 2;
        if (ahead(middle) > gap) high = middle;
        else {
          low = middle;
          gap = ahead(middle);
        }
      }
      return new Date(high);
    }
    low = next;
    gap = nextGap;
  }
  throw new Error(`no elongation of ${target} degrees within a month of ${date.toISOString()}`);
}

// The planets' Keplerian elements and their rates per century, J2000 ecliptic, from
// JPL's "Approximate Positions of the Planets", Table 1 (valid 1800-2050; errors of
// a fraction of a degree at worst): a (au), e, I, L, long. of perihelion, long. of
// node (degrees), each with its rate. Earth is the Earth-Moon barycenter.
const PLANETS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

export const PLANET_NAMES = Object.keys(PLANETS);

// A planet's heliocentric position at `date`, in au, in the J2000 ecliptic frame:
// x toward the vernal equinox, z to the ecliptic's north (JPL's formulae).
export function planetPosition(name, date) {
  const t = days(date) / 36525;
  const [a, e, inclination, meanLongitude, perihelion, node] = PLANETS[name][0].map(
    (value, i) => value + PLANETS[name][1][i] * t,
  );
  const omega = (perihelion - node) * RAD;
  const m = wrap180(meanLongitude - perihelion) * RAD;
  // Kepler's equation, by Newton's method.
  let anomaly = m + e * Math.sin(m);
  for (let i = 0; i < 10; i++) {
    anomaly -= (anomaly - e * Math.sin(anomaly) - m) / (1 - e * Math.cos(anomaly));
  }
  const x = a * (Math.cos(anomaly) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(anomaly);
  const [co, so] = [Math.cos(omega), Math.sin(omega)];
  const [cn, sn] = [Math.cos(node * RAD), Math.sin(node * RAD)];
  const [ci, si] = [Math.cos(inclination * RAD), Math.sin(inclination * RAD)];
  return {
    x: (co * cn - so * sn * ci) * x + (-so * cn - co * sn * ci) * y,
    y: (co * sn + so * cn * ci) * x + (-so * sn + co * cn * ci) * y,
    z: so * si * x + co * si * y,
  };
}

// A planet's heliocentric ecliptic longitude, in degrees.
export function planetLongitude(name, date) {
  const { x, y } = planetPosition(name, date);
  return wrap360(Math.atan2(y, x) / RAD);
}

// The sun's apparent ecliptic longitude at `date`, in degrees.
export function sunEclipticLongitude(date) {
  return sunLongitude(days(date));
}
