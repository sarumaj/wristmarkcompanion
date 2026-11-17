// The guided device test (?test): docs/device-tests.md step by step, under the
// camera's image. Each step says what to do, aloud too, while both hands hold the
// phone and the watch; the viewer's frames give the numbers (guide-metrics.js); the
// person adds what only they can judge. The results stay in this browser
// (localStorage) until the report is copied, downloaded or shared.
import { markerBrightness, sessionTimes, summarize, verdict } from "./guide-metrics.js";
import { report, SETUP_FIELDS } from "./guide-report.js";

const STORAGE_KEY = "wristmark-device-test";
const LIGHTS = ["indoor lamp", "indoor daylight", "outdoor shade", "outdoor sun", "dark room"];
const DISTANCES = [15, 30, 50, 75, 100, 150];
const ANGLES = [0, 30, 45, 60];
const SESSION_STARTS = ["opening app", "a button press", "auto-cycle on"];
const STEADY = ["yes", "jitters", "flips", "lost"];
// A session run ends this long after the marker was last seen (the display off),
// or at the latest after SESSION_MAX_MS.
const OFF_MS = 5000;
const SESSION_MAX_MS = 15 * 60 * 1000;
// After the display went off: how long a press on the watch may take to bring the
// marker back.
const PRESS_WAIT_MS = 15000;
const SKY_QUESTIONS = {
  moon: "Does the moon's phase match the sky?",
  earth: "Is the day side of the Earth where it's day now?",
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("on")) {
      element.addEventListener(key.slice(2), value);
    } else if (value !== false && value !== null && value !== undefined) {
      element.setAttribute(key, value === true ? "" : value);
    }
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

const round = (value, digits = 0) => (value === null || value === undefined ? "-" : value.toFixed(digits));

export function startGuide({ root, content, markerSize, captureSeconds = 10, countdownSeconds = 3 }) {
  const state = { setup: {}, results: [], battery: {}, notes: "", voice: true, ...load() };
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing: the results last as long as the page.
    }
  };
  const live = h("pre", { class: "guide-live", "aria-live": "off" }, "Camera off");
  const screen = h("div", { class: "guide-screen" });
  root.append(live, screen);
  root.hidden = false;

  let cameraOn = false;
  let current = home;
  let recent = [];
  let capture = null;
  let waitingFor = null;
  let lastLive = -Infinity;
  let audio = null;
  let wakeLock = null;

  // Speech and beeps, for the moments both hands are busy.
  function say(text) {
    if (!state.voice || !window.speechSynthesis) {
      return;
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  function beep(frequency = 880, ms = 150) {
    if (!state.voice) {
      return;
    }
    try {
      audio ??= new AudioContext();
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0.15;
      tone.frequency.value = frequency;
      tone.connect(gain).connect(audio.destination);
      tone.start();
      tone.stop(audio.currentTime + ms / 1000);
    } catch {
      // No audio: the screen says it too.
    }
  }
  // The screen stays on while the test runs: a session-length run lasts minutes.
  async function keepAwake() {
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock = null;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cameraOn && !wakeLock) {
      keepAwake();
    }
  });

  // The screen's content: nested arrays flattened, the parts left out (null) dropped.
  const fill = (nodes) => screen.replaceChildren(...[nodes].flat(Infinity).filter((node) => node !== null && node !== undefined && node !== false));
  function show(render) {
    current = render;
    fill(render());
    window.scrollTo({ top: 0 });
  }
  const back = () => h("button", { type: "button", class: "quiet", onclick: () => show(home) }, "Sections");
  // A step's header: the section, where in it, and a bar of the way done.
  const header = (section, detail, index, total) => [
    h("p", { class: "guide-kicker" }, section, total ? h("span", {}, `${index + 1} of ${total}`) : null),
    detail ? h("h2", {}, detail) : null,
    total ? h("progress", { class: "guide-steps", max: total, value: index }) : null,
  ];
  const needCamera = () => (cameraOn ? null : h("p", { class: "guide-note" }, "Start the camera first (the button above)."));
  const choice = (options, selected, pick) =>
    h("div", { class: "choices" }, options.map((option) =>
      h("button", { type: "button", "aria-pressed": String(option === selected), onclick: () => pick(option) }, option)));

  // A capture of `seconds` after a spoken countdown; `done(summary, frames)`.
  function measure(seconds, done, prompt = "Hold still") {
    let left = countdownSeconds;
    const tick = () => {
      if (left > 0) {
        screen.replaceChildren(h("div", { class: "guide-countdown" },
          h("p", {}, prompt),
          h("span", { class: "guide-ring" }, String(left))));
        say(String(left));
        beep(660, 80);
        left--;
        setTimeout(tick, 1000);
        return;
      }
      const bar = h("progress", { max: 1, value: 0 });
      screen.replaceChildren(h("div", { class: "guide-countdown" },
        h("p", {}, `Measuring for ${seconds} seconds`),
        h("p", { class: "guide-big" }, "Hold still"),
        bar));
      say("Measuring");
      beep(880);
      const start = performance.now();
      capture = {
        frames: [],
        progress: (frame) => (bar.value = Math.min(1, (frame.t - start) / (seconds * 1000))),
        until: (frame) => frame.t - start >= seconds * 1000,
        finish: (frames) => {
          const summary = summarize(frames, start, start + seconds * 1000);
          beep(1320, 250);
          say(`Done. ${Math.round(summary.rate * 100)} percent detected.`);
          done(summary, frames);
        },
      };
    };
    tick();
  }

  // A capture's numbers as tiles, each colored by how good it is.
  function resultCard(summary) {
    const grade = (value, good, fair, higher = true) =>
      (higher ? value >= good : value <= good) ? "good" : (higher ? value >= fair : value <= fair) ? "fair" : "poor";
    const tile = (label, value, health, detail) =>
      h("div", { class: "tile", "data-health": health }, h("span", { class: "tile-label" }, label), h("strong", {}, value), detail ? h("span", { class: "tile-detail" }, detail) : null);
    return h("div", { class: "tiles" },
      tile("Detected", `${Math.round(summary.rate * 100)} %`, grade(summary.rate, 0.9, 0.5), `${summary.frames} frames`),
      tile("Distance", summary.distance === null ? "–" : `${round(summary.distance / 10, 1)} cm`, null, `tilt ${round(summary.tilt)}°`),
      tile("FPS", round(summary.fps), grade(summary.fps, 24, 15), `${round(summary.detectMs, 1)} ms detect`),
      tile("Jitter", `±${round(summary.jitterMm, 1)} mm`, grade(summary.jitterMm, 1.5, 4, false), `±${round(summary.jitterDegrees, 1)}°`),
      tile("Flips", String(summary.flips), summary.flips ? "poor" : "good", null),
      tile("Longest gap", `${round(summary.longestGapMs)} ms`, grade(summary.longestGapMs, 300, 1000, false), null));
  }

  // The result of a range or angle capture: the measured verdict, the person's, a note.
  function judge(title, summary, record, next, redo) {
    const auto = verdict(summary);
    const result = { ...record, summary, auto, steady: auto, note: "" };
    const note = h("input", { type: "text", placeholder: "Note (optional)" });
    const render = () => [
      h("h2", {}, title),
      resultCard(summary),
      h("p", {}, `Steady? Measured: ${auto}. Change it if the model looked different:`),
      choice(STEADY, result.steady, (value) => {
        result.steady = value;
        fill(render());
      }),
      note,
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          result.note = note.value.trim();
          state.results.push(result);
          save();
          next();
        } }, "Save and next"),
        h("button", { type: "button", onclick: redo }, "Measure again"),
        back()),
    ];
    current = () => render();
    fill(render());
  }

  // 1. The setup table.
  function setup() {
    state.setup.date ||= new Date().toISOString().slice(0, 10);
    state.setup.markerMm ||= String(markerSize);
    state.setup.browser ||= navigator.userAgent;
    const inputs = SETUP_FIELDS.map(([key, label]) => [key, h("input", { type: "text", value: state.setup[key] ?? "", "aria-label": label })]);
    const measured = Number(state.setup.markerMm);
    const mismatch = measured && Math.abs(measured - markerSize) > 0.2;
    return [
      h("h2", {}, "Setup"),
      h("p", {}, "Measure the marker's black square on the watch with a ruler."),
      inputs.map(([key, input]) => h("label", { class: "field" }, SETUP_FIELDS.find(([k]) => k === key)[1], input)),
      mismatch ? h("p", { class: "guide-note" }, `The viewer computes distances for a ${markerSize} mm marker. `,
        h("a", { href: withParam("size", measured) }, `Reload for ${measured} mm`), " so the distances are right.") : null,
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          for (const [key, input] of inputs) {
            state.setup[key] = input.value.trim();
          }
          save();
          show(setup);
        } }, "Save"),
        back()),
    ];
  }

  // 2. Range: a light, red light or not, then each distance.
  function range(block = { lighting: null, night: false }) {
    return [
      h("h2", {}, "Range"),
      h("p", {}, "Which light are you in?"),
      choice(LIGHTS, block.lighting, (lighting) => show(() => range({ ...block, lighting }))),
      nightToggle(block, (night) => show(() => range({ ...block, night }))),
      h("p", { class: "actions" },
        h("button", { type: "button", disabled: !block.lighting, onclick: () => show(() => rangeStep(block, 0)) }, "Start"),
        back()),
    ];
  }
  function rangeStep(block, index) {
    if (index >= DISTANCES.length) {
      say("This light is done. Choose another one, or go back to the sections.");
      return range({ ...block, lighting: null });
    }
    const cm = DISTANCES[index];
    const label = `${block.lighting}${block.night ? ", red light" : ""}`;
    const again = () => show(() => rangeStep(block, index));
    const go = () => {
      say(`Hold the phone ${cm} centimeters from the watch.`);
      measure(captureSeconds, (summary) =>
        judge(`Range · ${label} · ${cm} cm`, summary, { kind: "range", lighting: block.lighting, night: block.night, distanceCm: cm },
          () => show(() => rangeStep(block, index + 1)), again));
    };
    return [
      header("Range", label, index, DISTANCES.length),
      h("p", { class: "guide-big" }, `${cm} cm`),
      h("p", {}, `Hold the phone ${cm} cm from the watch (a tape measure from the camera to the watch), the watch facing the camera, still for ${captureSeconds} seconds.`),
      needCamera(),
      h("p", { class: "actions" },
        h("button", { type: "button", disabled: !cameraOn, onclick: go }, "Measure"),
        h("button", { type: "button", onclick: () => show(() => rangeStep(block, index + 1)) }, "Skip"),
        back()),
    ];
  }

  function nightToggle(block, change) {
    return h("label", { class: "field-inline" },
      h("input", { type: "checkbox", checked: block.night, onchange: (event) => change(event.target.checked) }),
      " The watch in red light (night mode)");
  }

  // 3. Angle: at 30 cm, the watch turned away by each angle; the live line shows the tilt.
  function angle(block = { night: false }, index = 0) {
    if (index >= ANGLES.length) {
      say("Angles done.");
      return home();
    }
    const target = ANGLES[index];
    const again = () => show(() => angle(block, index));
    return [
      header("Angle", block.night ? "red light" : "", index, ANGLES.length),
      h("p", { class: "guide-big" }, `${target}°`),
      h("p", {}, `About 30 cm away, turn the watch away from the camera until the tilt in the line above reads about ${target}°.`),
      nightToggle(block, (night) => show(() => angle({ ...block, night }, index))),
      needCamera(),
      h("p", { class: "actions" },
        h("button", { type: "button", disabled: !cameraOn, onclick: () => {
          say(`Turn the watch to ${target} degrees.`);
          measure(captureSeconds, (summary) =>
            judge(`Angle · ${target}°`, summary, { kind: "angle", angle: target, night: block.night },
              () => show(() => angle(block, index + 1)), again));
        } }, "Measure"),
        h("button", { type: "button", onclick: () => show(() => angle(block, index + 1)) }, "Skip"),
        back()),
    ];
  }

  // 4. Session length: the phone propped up, the watch untouched; the marker's
  // brightness tells when the display dims, its loss when it goes off.
  function session(block = { startedBy: SESSION_STARTS[0], night: false }) {
    const how = {
      "opening app": "Close the app on the watch. Tap Start, then open the app right away.",
      "a button press": "With the app open, tap Start, then press a button on the watch right away.",
      "auto-cycle on": "Turn the watch's automatic cycle on, tap Start, then press a button on the watch.",
    }[block.startedBy];
    return [
      h("h2", {}, "Session length"),
      h("p", {}, "Prop the phone up so that the watch is in view, about 30 cm away, and don't touch the watch until the guide says so."),
      h("p", {}, "Started by:"),
      choice(SESSION_STARTS, block.startedBy, (startedBy) => show(() => session({ ...block, startedBy }))),
      nightToggle(block, (night) => show(() => session({ ...block, night }))),
      h("p", {}, how),
      needCamera(),
      h("p", { class: "actions" },
        h("button", { type: "button", disabled: !cameraOn, onclick: () => runSession(block) }, "Start"),
        back()),
    ];
  }
  function runSession(block) {
    const start = performance.now();
    let dimmedAt = null;
    const status = h("p", { class: "guide-big" }, "Waiting for the marker…");
    const dimmed = h("button", { type: "button", onclick: () => {
      dimmedAt = performance.now();
      dimmed.disabled = true;
      beep(440);
    } }, "It dimmed now");
    const stop = h("button", { type: "button", onclick: () => capture?.finish(capture.frames) }, "Stop");
    screen.replaceChildren(h("h2", {}, `Session · ${block.startedBy}`), status, h("p", { class: "actions" }, dimmed, stop));
    say("Go.");
    beep(880);
    let firstSeen = null;
    let lastSeen = null;
    capture = {
      frames: [],
      progress: (frame) => {
        if (frame.found) {
          firstSeen ??= frame.t;
          lastSeen = frame.t;
        }
        if (firstSeen !== null) {
          status.textContent = `${Math.round((frame.t - firstSeen) / 1000)} s` + (frame.found ? "" : " (marker not seen)");
        }
      },
      until: (frame) => (lastSeen !== null && frame.t - lastSeen > OFF_MS) || frame.t - start > SESSION_MAX_MS,
      finish: (frames) => {
        capture = null;
        const times = sessionTimes(frames, { offMs: OFF_MS });
        // Pressed before the marker was first seen: it was dim from the start.
        const manualDims = dimmedAt !== null && firstSeen !== null ? Math.max(0, dimmedAt - firstSeen) / 1000 : null;
        const dimFromStart = dimmedAt !== null && firstSeen !== null && dimmedAt < firstSeen;
        const result = {
          kind: "session",
          startedBy: block.startedBy,
          night: block.night,
          dimsAfter: manualDims ?? times.dimsAfter,
          offAfter: times.offAfter,
          rateWhileDimmed: times.rateWhileDimmed,
          onAgain: null,
          note: [
            dimFromStart ? "dim before the marker was seen" : "",
            manualDims !== null && times.dimsAfter !== null ? `dimming measured at ${round(times.dimsAfter)} s` : "",
          ].filter(Boolean).join("; "),
        };
        if (times.offAfter === null) {
          // Stopped by hand, the display still on.
          finishSession(result);
          return;
        }
        beep(440, 400);
        say("The marker is gone. Press a button on the watch now.");
        screen.replaceChildren(h("h2", {}, "Press a button on the watch"), h("p", {}, "Waiting for the marker to come back…"));
        const timer = setTimeout(() => {
          waitingFor = null;
          result.onAgain = "no";
          finishSession(result);
        }, PRESS_WAIT_MS);
        waitingFor = {
          id: null,
          found: () => {
            clearTimeout(timer);
            result.onAgain = "yes";
            finishSession(result);
          },
        };
      },
    };
  }
  function finishSession(result) {
    say(`Off after ${round(result.offAfter)} seconds.`);
    const note = h("input", { type: "text", placeholder: "Note (optional)", value: result.note });
    const render = () => [
      h("h2", {}, "Session result"),
      h("pre", { class: "guide-result" }, [
        `dims after  ${round(result.dimsAfter)} s`,
        `off after   ${round(result.offAfter)} s`,
        `while dim   ${result.rateWhileDimmed === null ? "-" : `${Math.round(result.rateWhileDimmed * 100)} % detected`}`,
      ].join("\n")),
      h("p", {}, "After a press: on again?"),
      choice(["yes", "no"], result.onAgain, (value) => {
        result.onAgain = value;
        fill(render());
      }),
      note,
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          result.note = note.value.trim();
          state.results.push(result);
          save();
          show(() => session({ startedBy: result.startedBy, night: result.night }));
        } }, "Save"),
        h("button", { type: "button", onclick: () => show(() => session({ startedBy: result.startedBy, night: result.night })) }, "Discard"),
        back()),
    ];
    current = () => render();
    fill(render());
  }

  // 5. The models: each marker in turn, measured as soon as the watch shows it.
  const models = [...content.entries()].sort(([a], [b]) => a - b);
  function model(index = 0) {
    if (index >= models.length) {
      say("All models done.");
      return home();
    }
    const [id, entry] = models[index];
    const again = () => show(() => model(index));
    waitingFor = {
      id,
      found: () => measure(5, (summary) => modelResult(index, summary, again), "Found it, hold still"),
    };
    say(`Show marker ${id}, ${entry.name}.`);
    return [
      header("Models", "", index, models.length),
      h("p", { class: "guide-big" }, `Marker ${id}: ${entry.name}`),
      h("p", {}, "Show it on the watch (its next and previous buttons). The guide measures as soon as it sees it."),
      needCamera(),
      h("p", { class: "actions" },
        h("button", { type: "button", class: "quiet", onclick: () => {
          waitingFor = null;
          show(() => model(index + 1));
        } }, "Skip"),
        h("button", { type: "button", onclick: () => {
          waitingFor = null;
          show(home);
        } }, "Sections")),
    ];
  }
  function modelResult(index, summary, again) {
    const [id, entry] = models[index];
    const result = { kind: "model", id, name: entry.name, summary, sits: null, smooth: null, sky: null, note: "" };
    const question = SKY_QUESTIONS[entry.model];
    const note = h("input", { type: "text", placeholder: "Note (optional)" });
    const render = () => [
      h("h2", {}, `Marker ${id}: ${entry.name}`),
      h("p", {}, `${round(summary.fps)} FPS, ${Math.round(summary.rate * 100)} % detected.`),
      h("p", {}, "Sits on the watch?"),
      choice(["yes", "no"], result.sits, (value) => {
        result.sits = value;
        fill(render());
      }),
      h("p", {}, "Smooth?"),
      choice(["yes", "no"], result.smooth, (value) => {
        result.smooth = value;
        fill(render());
      }),
      question ? [h("p", {}, question), choice(["yes", "no"], result.sky, (value) => {
        result.sky = value;
        fill(render());
      })] : null,
      note,
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          result.note = note.value.trim();
          state.results.push(result);
          save();
          show(() => model(index + 1));
        } }, "Save and next"),
        h("button", { type: "button", onclick: again }, "Measure again"),
        back()),
    ];
    current = () => render();
    fill(render());
  }

  // 6. Battery and anything else.
  function notes() {
    const before = h("input", { type: "number", min: 0, max: 100, value: state.battery.before ?? "" });
    const after = h("input", { type: "number", min: 0, max: 100, value: state.battery.after ?? "" });
    const text = h("textarea", { rows: 5 }, state.notes ?? "");
    return [
      h("h2", {}, "Battery and notes"),
      h("p", {}, "The watch's battery before and after 10 minutes of the app (with presses to keep it on), in percent."),
      h("label", { class: "field" }, "Before", before),
      h("label", { class: "field" }, "After", after),
      h("label", { class: "field" }, "Anything else: how holding the phone and the watch felt, what was annoying, ideas.", text),
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          state.battery = { before: before.value, after: after.value };
          state.notes = text.value;
          save();
          show(home);
        } }, "Save"),
        back()),
    ];
  }

  function reportScreen() {
    const markdown = report(state, { viewer: location.host });
    const copied = h("span", { role: "status" });
    return [
      h("h2", {}, "Report"),
      h("p", {}, "Copy it into a message, or into docs/device-tests.md."),
      h("p", { class: "actions" },
        h("button", { type: "button", onclick: async () => {
          try {
            await navigator.clipboard.writeText(markdown);
            copied.textContent = "Copied.";
          } catch {
            copied.textContent = "The browser refused; select the text below instead.";
          }
        } }, "Copy"),
        h("button", { type: "button", onclick: () => {
          const link = h("a", { href: URL.createObjectURL(new Blob([markdown], { type: "text/markdown" })), download: `device-test-${state.setup.date || "results"}.md` });
          link.click();
          URL.revokeObjectURL(link.href);
        } }, "Download"),
        navigator.share ? h("button", { type: "button", onclick: () => navigator.share({ title: "Device test results", text: markdown }).catch(() => {}) }, "Share") : null,
        back(), copied),
      h("pre", { class: "guide-report" }, markdown),
    ];
  }

  function home() {
    const count = (kind) => state.results.filter((result) => result.kind === kind).length;
    const sections = [
      ["Setup", "Watch, phone and the marker's size", state.setup.watch ? "done" : "", setup],
      ["Range", "Detection at 15 to 150 cm, per light", count("range") ? `${count("range")} measured` : "", () => range()],
      ["Angle", "The watch turned 0 to 60°", count("angle") ? `${count("angle")} of ${ANGLES.length}` : "", () => angle()],
      ["Session length", "When the display dims and turns off", count("session") ? `${count("session")} runs` : "", () => session()],
      ["Models", "Each marker's model on the watch", count("model") ? `${count("model")} of ${models.length}` : "", () => model(Math.min(count("model"), models.length - 1))],
      ["Battery and notes", "Battery use, anything else", state.battery.before || state.notes ? "done" : "", notes],
    ];
    const done = sections.filter(([, , status]) => status).length;
    return [
      h("p", { class: "guide-kicker" }, "Device test", h("span", {}, `${done} of ${sections.length} sections`)),
      h("h2", {}, "Test the watch, step by step"),
      h("progress", { class: "guide-steps", max: sections.length, value: done }),
      h("p", { class: "guide-muted" }, "Each step says what to do and measures itself. The results stay on this phone until you copy them."),
      h("ol", { class: "guide-sections" },
        sections.map(([label, detail, status, render], i) =>
          h("li", {}, h("button", { type: "button", class: "section-card", onclick: () => show(render) },
            h("span", { class: "section-number" }, String(i + 1)),
            h("span", { class: "section-text" }, h("strong", {}, label), h("span", {}, detail)),
            status ? h("span", { class: "section-status" }, status) : null)))),
      h("p", { class: "actions" }, h("button", { type: "button", class: "primary", onclick: () => show(reportScreen) }, "Report")),
      h("label", { class: "field-inline" },
        h("input", { type: "checkbox", checked: state.voice, onchange: (event) => {
          state.voice = event.target.checked;
          save();
        } }),
        " Spoken prompts and beeps"),
      h("p", { class: "actions" },
        h("button", { type: "button", class: "quiet", onclick: () => {
          if (confirm("Delete every result on this phone?")) {
            state.setup = {};
            state.results = [];
            state.battery = {};
            state.notes = "";
            save();
            show(home);
          }
        } }, "Start over")),
    ];
  }

  function updateLive(frame) {
    recent.push(frame);
    while (recent.length && recent[0].t < frame.t - 1000) {
      recent.shift();
    }
    if (frame.t - lastLive < 250) {
      return;
    }
    lastLive = frame.t;
    const summary = summarize(recent, frame.t - 1000, frame.t);
    live.textContent = frame.found
      ? `ID ${frame.id}  ${round(frame.distance / 10)} cm  tilt ${round(frame.tilt)}°  ${Math.round(summary.rate * 100)} %  ${round(summary.fps)} FPS`
      : `no marker  ${Math.round(summary.rate * 100)} %  ${round(summary.fps)} FPS`;
  }

  show(home);
  return {
    cameraStarted() {
      cameraOn = true;
      keepAwake();
      show(current);
    },
    // A processed frame: {t, found, id, detectMs, distance, position, normal, tilt,
    // image, corners}; the image is read here and not kept.
    frame(frame) {
      const record = {
        t: frame.t,
        found: frame.found,
        id: frame.id,
        detectMs: frame.detectMs,
        distance: frame.distance,
        position: frame.position,
        normal: frame.normal,
        tilt: frame.tilt,
        brightness: frame.found && frame.corners ? markerBrightness(frame.image, frame.corners) : null,
      };
      updateLive(record);
      if (waitingFor && record.found && (waitingFor.id === null || waitingFor.id === record.id)) {
        const { found } = waitingFor;
        waitingFor = null;
        found();
      }
      if (capture) {
        capture.frames.push(record);
        capture.progress?.(record);
        if (capture.until(record)) {
          const { frames, finish } = capture;
          capture = null;
          finish(frames);
        }
      }
    },
  };
}

function withParam(key, value) {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  return url.toString();
}
