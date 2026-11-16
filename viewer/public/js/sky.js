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
