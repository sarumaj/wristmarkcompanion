// The sun's and the moon's positions (public/js/sky.js) against published times:
// the equinox and solstice of 2024 and the moon's phases of January 2024, from the
// USNO's tables (Earth's seasons, phases of the moon).
import { test } from "node:test";
import assert from "node:assert/strict";
import { moonPhase, nextElongation, subsolarPoint } from "../public/js/sky.js";

const HOUR = 3600000;

test("the sun is overhead at the equator at the equinox and at the tropic at the solstice", () => {
  const equinox = subsolarPoint(new Date("2024-03-20T03:06Z"));
  assert.ok(Math.abs(equinox.latitude) < 0.05, `equinox latitude ${equinox.latitude}`);
  const solstice = subsolarPoint(new Date("2024-06-20T20:51Z"));
  assert.ok(Math.abs(solstice.latitude - 23.44) < 0.05, `solstice latitude ${solstice.latitude}`);
});

test("the sun is over Greenwich at noon, give or take the equation of time", () => {
  // On 2024-11-03 the sun is 16.4 minutes early (the equation of time): at 12:00 UTC
  // it has passed Greenwich by 4.1 degrees, to the west.
  const noon = subsolarPoint(new Date("2024-11-03T12:00Z"));
  assert.ok(Math.abs(noon.longitude + 4.1) < 0.3, `longitude ${noon.longitude}`);
  const midnight = subsolarPoint(new Date("2024-11-03T00:00Z"));
  assert.ok(Math.abs(Math.abs(midnight.longitude) - 175.9) < 0.5, `longitude ${midnight.longitude}`);
});

test("the moon's phases fall within an hour of the published times", () => {
  const near = (date, expected) =>
    assert.ok(Math.abs(date - new Date(expected)) < HOUR, `${date.toISOString()} is not near ${expected}`);
  near(nextElongation(new Date("2024-01-01T00:00Z"), 0), "2024-01-11T11:57Z");
  near(nextElongation(new Date("2024-01-01T00:00Z"), 180), "2024-01-25T17:54Z");
  near(nextElongation(new Date("2024-01-12T00:00Z"), 0), "2024-02-09T22:59Z");
});

test("the phase: dark at new moon, full at full moon, half and waxing at first quarter", () => {
  assert.ok(moonPhase(new Date("2024-01-11T11:57Z")).illumination < 0.01);
  assert.ok(moonPhase(new Date("2024-01-25T17:54Z")).illumination > 0.99);
  const quarter = moonPhase(new Date("2024-01-18T03:53Z"));
  assert.ok(Math.abs(quarter.illumination - 0.5) < 0.03, `first quarter ${quarter.illumination}`);
  assert.equal(quarter.waxing, true);
  assert.equal(moonPhase(new Date("2024-02-02T23:18Z")).waxing, false);
});

test("the planets: the Earth opposite the sun, and Mars, Jupiter and Saturn in line with it at opposition", async () => {
  const { planetLongitude, sunEclipticLongitude } = await import("../public/js/sky.js");
  const apart = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  // The Earth's heliocentric longitude is the sun's geocentric one turned by 180
  // degrees, once the J2000 frame of the elements is moved to the equinox of the
  // date (precession, 1.397 degrees a century); left over are the aberration (20
  // arcseconds) and the moon's pull on the barycenter.
  for (const date of ["2024-03-20T03:06Z", "2026-11-16T00:00Z", "2030-07-01T00:00Z"]) {
    const centuries = (new Date(date) - new Date("2000-01-01T12:00Z")) / (36525 * 86400000);
    const earth = planetLongitude("earth", new Date(date)) + 1.397 * centuries;
    const gap = apart(earth, sunEclipticLongitude(new Date(date)) + 180);
    assert.ok(gap < 0.05, `the Earth is ${gap} degrees off on ${date}`);
  }
  // Oppositions (the planet behind the Earth, seen from the sun), from the USNO's
  // and NASA's published dates: within a day's motion of the Earth, a degree.
  for (const [planet, date] of [["mars", "2025-01-16T02:00Z"], ["jupiter", "2024-12-07T21:00Z"], ["saturn", "2025-09-21T04:00Z"]]) {
    const gap = apart(planetLongitude(planet, new Date(date)), planetLongitude("earth", new Date(date)));
    assert.ok(gap < 1, `${planet} is ${gap} degrees from opposition on ${date}`);
  }
});
