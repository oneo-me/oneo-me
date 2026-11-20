// Renders the profile README's hero, assets/hero.svg, in the style of oneo.me.
// Text is converted to vector paths with the site's fonts, so GitHub shows it identically everywhere.
// Run: cd scripts && bun install && bun run render
import opentype from "opentype.js";

const ROOT = new URL("../", import.meta.url).pathname;
const FONTS = new URL("./node_modules/@fontsource/", import.meta.url).pathname;

async function font(path: string) {
  return opentype.parse(await Bun.file(FONTS + path).arrayBuffer());
}

const mono = await font("jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff");
const monoBold = await font("jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff");
const display = await font("space-grotesk/files/space-grotesk-latin-700-normal.woff");
const displayMedium = await font("space-grotesk/files/space-grotesk-latin-500-normal.woff");

const C = {
  void: "#07080a",
  panel: "#0e1013",
  text: "#e6e8e3",
  mute: "#7d8288",
  wire: "#1d2126",
  acid: "#b6ff3b",
  cyan: "#38e8ff",
  pink: "#ff3d8b",
};

const W = 1200;

// ---------- drawing helpers ----------

type Font = opentype.Font;

/** Serializes glyph outlines; opentype.js's own toPathData can emit NaN when rounding. */
function pathData(path: opentype.Path) {
  const n = (v: number) => String(Math.round(v * 10) / 10);
  return path.commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case "Q":
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
        case "C":
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
}

function text(f: Font, s: string, x: number, y: number, size: number, fill: string, attrs = "") {
  const d = pathData(f.getPath(s, x, y, size));
  return d ? `<path d="${d}" fill="${fill}"${attrs ? ` ${attrs}` : ""}/>` : "";
}

function width(f: Font, s: string, size: number) {
  return f.getAdvanceWidth(s, size);
}

/** Draws text from the right edge `x`. */
function textEnd(f: Font, s: string, x: number, y: number, size: number, fill: string) {
  return text(f, s, x - width(f, s, size), y, size, fill);
}

function wrap(f: Font, s: string, size: number, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(f, next, size) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}


function chevron(x: number, y: number, size: number, stroke: string) {
  return `<polyline points="${x},${y - size} ${x + size * 0.7},${y - size / 2} ${x},${y}" fill="none" stroke="${stroke}" stroke-width="${size * 0.22}" stroke-linecap="round" stroke-linejoin="round"/>`;
}


function sparkle(cx: number, cy: number, r: number, fill: string) {
  return `<path d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z" fill="${fill}"/>`;
}

function blink(x: number, y: number, w: number, h: number, fill: string) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" repeatCount="indefinite"/></rect>`;
}

/** The page backdrop: void color, dot grid, CRT scanlines and a vignette. */
function backdrop(id: string, w: number, h: number) {
  return `<defs>
<pattern id="${id}-dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="1" fill="${C.mute}" opacity="0.22"/></pattern>
<pattern id="${id}-scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity="0.025"/></pattern>
<radialGradient id="${id}-vignette" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient>
<clipPath id="${id}-frame"><rect width="${w}" height="${h}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#${id}-frame)">
<rect width="${w}" height="${h}" fill="${C.void}"/>
<rect width="${w}" height="${h}" fill="url(#${id}-dots)"/>`;
}

function backdropEnd(id: string, w: number, h: number) {
  return `<rect width="${w}" height="${h}" fill="url(#${id}-scan)"/>
<rect width="${w}" height="${h}" fill="url(#${id}-vignette)"/>
</g>`;
}

function svg(w: number, h: number, title: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>\n${body}\n</svg>\n`;
}

/** Cyan and pink copies of each letter that flash in offset slices now and then, like the site's wordmark.
 * A letter's `dim` animates its opacity, so a dark letter's slices go dark with it. */
function glitch(id: string, letters: { d: string; dim?: string }[], top: number, height: number, period = 3.2) {
  const slice = (offset: number, cuts: [number, number][]) => {
    const ys = cuts.map(([from]) => (top + from * height).toFixed(1));
    const hs = cuts.map(([from, to]) => ((to - from) * height).toFixed(1));
    return { ys: `${top + height};${ys.join(";")};${top + height}`, hs: `0;${hs.join(";")};0`, offset };
  };
  const a = slice(0, [[0.12, 0.36], [0.58, 0.82], [0.34, 0.56]]);
  const b = slice(0, [[0.7, 0.94], [0.08, 0.22], [0.4, 0.6]]);
  const times = "0;0.86;0.89;0.92;0.95";
  const layer = (name: string, color: string, dx: string, s: typeof a, dur: number) => `
<clipPath id="${id}-${name}"><rect x="0" width="${W}" y="${top + height}" height="0">
<animate attributeName="y" values="${s.ys}" keyTimes="${times}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>
<animate attributeName="height" values="${s.hs}" keyTimes="${times}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>
</rect></clipPath>
<g clip-path="url(#${id}-${name})" transform="translate(${dx} 0)">${letters
    .map(({ d, dim }) => (dim ? `<path d="${d}" fill="${color}">${dim}</path>` : `<path d="${d}" fill="${color}"/>`))
    .join("")}</g>`;
  return layer("a", C.cyan, "-8", a, period) + layer("b", C.pink, "8", b, period * 0.84);
}

// ---------- flickering lamps ----------

/** A seeded random source, so every render writes the same SVG. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Lamp = "head" | "tail";
type LampKey = { t: number; level: number; glow: number };
type Bolt = { lamp: Lamp; from: number; span: number; start: number; end: number; tint: string };

const BOLT_TINTS = [C.acid, C.acid, C.acid, C.cyan, C.text];

/**
 * Plays the site's MorphTitle once, ahead of time: the outer O's of the wordmark flicker like failing
 * lamps, die, catch again and brown out, so the word reads ONEO, ONE or NEO, and one O always stays
 * lit. It records every change of light and every arc, in milliseconds, until at least `length` has
 * passed and both lamps are lit again, so the recording loops seamlessly from the whole word.
 */
function flickerScript(seed: number, length: number) {
  const rnd = random(seed);
  const between = (low: number, high: number) => low + rnd() * (high - low);
  const keys: Record<Lamp, LampKey[]> = { head: [{ t: 0, level: 1, glow: 0 }], tail: [{ t: 0, level: 1, glow: 0 }] };
  const bolts: Bolt[] = [];
  const on = { head: true, tail: true };
  const levels = { head: 1, tail: 1 };
  const other = (lamp: Lamp): Lamp => (lamp === "head" ? "tail" : "head");
  let t = between(1400, 2600);

  // Whatever the flickers ask for, one O always stays readable.
  const light = (lamp: Lamp, level: number, glow = 0) => {
    if (levels[other(lamp)] < 0.6) level = Math.max(level, 0.6);
    levels[lamp] = level;
    keys[lamp].push({ t, level, glow });
  };

  const spark = (lamp: Lamp, time: number, count = 1 + Math.floor(rnd() * 3)) => {
    for (let i = 0; i < count; i++)
      bolts.push({
        lamp,
        from: rnd() * Math.PI * 2,
        span: between(0.5, 2.6),
        start: t,
        end: t + time * between(0.5, 1),
        tint: BOLT_TINTS[Math.floor(rnd() * BOLT_TINTS.length)]!,
      });
  };

  // A run of flickers that settles on or off. A lamp that must stay lit only dims, never dies.
  const flicker = (lamp: Lamp, end: boolean) => {
    const floor = on[other(lamp)] ? 0 : 0.45;
    let left = 2 + Math.floor(rnd() * 9);
    while (left-- > 0) {
      const bright = left % 2 === 0 || rnd() < 0.2;
      const glow = bright && rnd() < 0.65 ? 1 : 0;
      light(lamp, bright ? between(0.55, 1) : between(floor, floor + 0.3), glow);
      const time = rnd() < 0.15 ? between(150, 420) : between(22, 120);
      if (glow) spark(lamp, time + 40);
      t += time;
    }
    on[lamp] = end;
    light(lamp, end ? 1 : 0);
    // A lamp that dies goes out with a last crackle.
    if (!end && rnd() < 0.7) spark(lamp, between(80, 200), 2 + Math.floor(rnd() * 3));
  };

  // A lamp that hums dimly for a moment and recovers.
  const brownout = (lamp: Lamp) => {
    const floor = on[other(lamp)] ? 0.2 : 0.5;
    const end = t + between(300, 1100);
    while (t <= end) {
      light(lamp, between(floor, 0.75));
      if (rnd() < 0.12) spark(lamp, 60, 1);
      t += between(30, 90);
    }
    light(lamp, 1);
  };

  const rest = (low: number, high: number) => (t += between(low, high));

  while (t < length || !on.head || !on.tail) {
    const dark: Lamp | undefined = !on.head ? "head" : !on.tail ? "tail" : undefined;
    const roll = rnd();
    if (!dark) {
      const lamp: Lamp = rnd() < 0.5 ? "head" : "tail";
      if (roll < 0.6) {
        flicker(lamp, false);
        rest(700, 4200);
      } else if (roll < 0.85) {
        flicker(lamp, true);
        rest(300, 2000);
      } else {
        brownout(lamp);
        rest(400, 2200);
      }
      continue;
    }
    const lit = other(dark);
    if (roll < 0.45) {
      // The dark lamp catches and the lit one fails soon after: ONE turns into NEO.
      flicker(dark, true);
      rest(0, 500);
      flicker(lit, false);
      rest(700, 4200);
    } else if (roll < 0.7) {
      flicker(dark, true);
      rest(500, 2600);
    } else if (roll < 0.85) {
      flicker(dark, false);
      rest(400, 2000);
    } else if (roll < 0.93) {
      flicker(lit, true);
      rest(400, 2000);
    } else {
      brownout(lit);
      rest(400, 2000);
    }
  }
  return { keys, bolts, duration: t };
}

/** A discrete SMIL track over the whole loop, from points in milliseconds. Same-time points keep the last. */
function track(attribute: string, points: { t: number; value: string }[], duration: number) {
  const merged: { key: string; value: string }[] = [];
  for (const { t, value } of points) {
    const key = (Math.round((t / duration) * 1e5) / 1e5).toString();
    const last = merged[merged.length - 1];
    if (last && last.key === key) last.value = value;
    else if (last?.value !== value) merged.push({ key, value });
  }
  return `<animate attributeName="${attribute}" values="${merged.map((p) => p.value).join(";")}" keyTimes="${merged.map((p) => p.key).join(";")}" dur="${(duration / 1000).toFixed(3)}s" calcMode="discrete" repeatCount="indefinite"/>`;
}

/** The middle line of an O's stroke: the center, radii and stroke thickness of the glyph's two contours. */
function filament(path: opentype.Path) {
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const c of path.commands) {
    if (c.type === "M") boxes.push({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
    else if (c.type !== "Z") {
      const box = boxes[boxes.length - 1]!;
      box.x1 = Math.min(box.x1, c.x);
      box.y1 = Math.min(box.y1, c.y);
      box.x2 = Math.max(box.x2, c.x);
      box.y2 = Math.max(box.y2, c.y);
    }
  }
  boxes.sort((a, b) => b.x2 - b.x1 - (a.x2 - a.x1));
  const [outer, inner] = boxes as [(typeof boxes)[0], (typeof boxes)[0]];
  const thick = inner.x1 - outer.x1;
  return {
    x: (outer.x1 + outer.x2) / 2,
    y: (outer.y1 + outer.y2) / 2,
    rx: (outer.x2 - outer.x1 - thick) / 2,
    ry: (outer.y2 - outer.y1 - thick) / 2,
    thick,
  };
}

let arcCount = 0;

/**
 * Jagged arcs along an O's filament, one path per tint whose shape is swapped every few frames while
 * any of its arcs burn, so they crackle the way the site redraws them every frame.
 */
function arcs(bolts: Bolt[], o: ReturnType<typeof filament>, duration: number, rnd: () => number) {
  const FRAME = 60;
  const n = (v: number) => String(Math.round(v));
  // A rounded-square curve, close to the shape of the O.
  const at = (angle: number, offset: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      o.x + (o.rx + offset) * Math.sign(cos) * Math.abs(cos) ** 0.7,
      o.y + (o.ry + offset) * Math.sign(sin) * Math.abs(sin) ** 0.7,
    ] as const;
  };
  const line = (points: (readonly [number, number])[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${n(x)} ${n(y)}`).join("");
  const shape = (bolt: Bolt) => {
    const count = Math.max(6, Math.round(bolt.span * 9));
    const path = Array.from({ length: count + 1 }, (_, i) =>
      at(bolt.from + (bolt.span * i) / count, i === 0 || i === count ? 0 : (rnd() - 0.5) * o.thick * 0.6),
    );
    let d = line(path);
    const branches = rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let b = 0; b < branches; b++) {
      const start = Math.floor(rnd() * count);
      const angle = bolt.from + (bolt.span * start) / count;
      const out = rnd() < 0.5 ? 1 : -1;
      d += line([path[start]!, ...[1, 2, 3].map((step) => at(angle + (rnd() - 0.5) * 0.25, out * step * o.thick * 0.35))]);
    }
    return d;
  };

  let body = "";
  for (const tint of new Set(BOLT_TINTS)) {
    const mine = bolts.filter((bolt) => bolt.tint === tint);
    if (!mine.length) continue;
    const edges = [...new Set([0, duration, ...mine.flatMap((bolt) => [bolt.start, bolt.end])])].sort((a, b) => a - b);
    const points: { t: number; value: string }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const [from, to] = [edges[i]!, edges[i + 1]!];
      const live = mine.filter((bolt) => bolt.start <= from && bolt.end >= to);
      if (!live.length) {
        points.push({ t: from, value: "M0 0" });
        continue;
      }
      for (let t = from; t < to; t += FRAME) points.push({ t, value: live.map(shape).join("") });
    }
    // One animated shape, drawn twice: a glowing colored stroke and a thin white core.
    const ref = `arc-${(arcCount++).toString(36)}`;
    body += `<defs><path id="${ref}" d="M0 0">${track("d", points, duration)}</path></defs>`;
    body += `<use href="#${ref}" fill="none" stroke="${tint}" stroke-width="${Math.max(0.8, o.thick / 28).toFixed(2)}" filter="url(#arc-glow)"/>`;
    body += `<use href="#${ref}" fill="none" stroke="#ffffff" stroke-width="${Math.max(0.5, o.thick / 70).toFixed(2)}"/>`;
  }
  return body;
}

/** The wordmark: N and E steady, the outer O's flickering with arcs, every letter with glitch slices. */
function wordmark(id: string, word: string, x: number, baseline: number, size: number) {
  const glyphs = display.getPaths(word, x, baseline, size);
  const { keys, bolts, duration } = flickerScript(7, 48000);
  const lamps: Partial<Record<number, Lamp>> = { 0: "head", [glyphs.length - 1]: "tail" };
  const rnd = random(11);
  let sparks = "";
  const thick = filament(glyphs[0]!).thick;

  let body = `<defs>
<filter id="${id}-spark" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(size * 0.025).toFixed(1)}" result="near"/><feFlood flood-color="${C.acid}" flood-opacity="0.8"/><feComposite in2="near" operator="in" result="a"/><feGaussianBlur in="SourceAlpha" stdDeviation="${(size * 0.125).toFixed(1)}" result="far"/><feFlood flood-color="${C.acid}" flood-opacity="0.4"/><feComposite in2="far" operator="in" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="a"/></feMerge></filter>
<filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(thick * 0.17).toFixed(1)}" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;
  const letters = glyphs.map((glyph, i) => {
    const d = pathData(glyph);
    const lamp = lamps[i];
    if (!lamp) {
      body += `<path d="${d}" fill="${C.text}"/>`;
      return { d };
    }
    const level = (k: LampKey) => ({ t: k.t, value: String(Math.round(k.level * 100) / 100) });
    // The letter's green glow while it sparks, then the letter itself, lit by its level and
    // turning into a hollow gray outline as it dies.
    body += `<path d="${d}" fill="${C.acid}" filter="url(#${id}-spark)" opacity="0">${track("opacity", keys[lamp].map((k) => ({ t: k.t, value: String(k.glow) })), duration)}</path>`;
    body += `<path d="${d}" fill="${C.text}" stroke="${C.mute}" stroke-width="${(size * 0.012).toFixed(1)}" stroke-opacity="0">${track("fill-opacity", keys[lamp].map(level), duration)}${track("stroke-opacity", keys[lamp].map((k) => ({ t: k.t, value: String(Math.round(0.45 * (1 - k.level) * 100) / 100) })), duration)}</path>`;
    sparks += arcs(bolts.filter((bolt) => bolt.lamp === lamp), filament(glyph), duration, rnd);
    return { d, dim: track("opacity", keys[lamp].map(level), duration) };
  });
  body += glitch(id, letters, baseline - size * 0.72, size * 0.74);
  return body + sparks;
}

// ---------- tiles ----------

function hero() {
  const h = 640;
  const id = "hero";
  let body = backdrop(id, W, h);
  body += `<radialGradient id="glow" cx="78%" cy="45%" r="35%"><stop offset="0" stop-color="${C.acid}" stop-opacity="0.08"/><stop offset="1" stop-color="${C.acid}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${h}" fill="url(#glow)"/>`;

  // Top bar.
  body += chevron(48, 50, 13, C.acid);
  body += text(mono, "oneo.me", 68, 50, 16, C.text);
  body += blink(68 + width(mono, "oneo.me ", 16), 36, 9, 18, C.acid);
  body += textEnd(mono, "[github]  [x]  [email]  [sponsor]", W - 48, 50, 15, C.mute);
  body += `<rect x="0" y="76" width="${W}" height="1" fill="${C.wire}"/>`;

  // Status line.
  body += `<circle cx="54" cy="127" r="5" fill="${C.acid}"/><circle cx="54" cy="127" r="5" fill="${C.acid}"><animate attributeName="r" values="5;13" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="1.4s" repeatCount="indefinite"/></circle>`;
  body += text(mono, "online", 70, 132, 15, C.acid);
  body += text(mono, "// designer turned developer  // shanghai  // go + typescript + rust", 70 + width(mono, "online  ", 15), 132, 15, C.mute);

  // Wordmark.
  const size = 232;
  const baseline = 352;
  body += wordmark(id, "ONEO", 40, baseline, size);

  // Greeting and intro.
  body += text(displayMedium, "Hi, I’m ONEO.", 48, 430, 32, C.text);
  body += text(displayMedium, "I make native apps,", 48 + width(displayMedium, "Hi, I’m ONEO. ", 32), 430, 32, C.acid);
  body += text(displayMedium, "and the frameworks underneath them.", 48, 472, 32, C.acid);
  const intro = wrap(mono, "Designer turned developer. I build native UI in Go, keep data in plain local files, and make tools that work alongside coding agents.", 14, 560);
  intro.forEach((line, i) => (body += text(mono, line, 48, 520 + i * 24, 14, C.mute)));

  // Terminal with typed lines.
  const tx = 690;
  const ty = 150;
  const tw = W - 48 - tx;
  const th = 340;
  body += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="${C.panel}" stroke="${C.wire}"/>`;
  body += `<rect x="${tx}" y="${ty}" width="${tw}" height="34" fill="${C.panel}" stroke="${C.wire}"/>`;
  body += text(mono, "oneo@shanghai: ~", tx + 16, ty + 22, 12, C.mute);
  body += textEnd(mono, "zsh — 80×24", tx + tw - 16, ty + 22, 12, C.mute);
  const lines: { s: string; command?: boolean }[] = [
    { s: "whoami", command: true },
    { s: "oneo — designer turned developer @ shanghai" },
    { s: "cat mission.txt", command: true },
    { s: "I make native apps, and the frameworks" },
    { s: "underneath them." },
    { s: "ls ~/projects", command: true },
    { s: "nsgo hando umapp agio scenra onevra onegit" },
    { s: "neohm manta smile-icons locus" },
  ];
  const size14 = 14;
  const ch = width(mono, "a", size14);
  let delay = 0.6;
  lines.forEach((line, i) => {
    const y = ty + 70 + i * 28;
    const x = tx + 20;
    if (line.command) body += text(mono, "$", x, y, size14, C.acid);
    const sx = line.command ? x + ch * 2 : x;
    body += text(mono, line.s, sx, y, size14, line.command ? C.text : C.mute);
    // A cover in the terminal color shrinks one character at a time, revealing the line.
    const n = line.s.length;
    const per = line.command ? 0.06 : 0.012;
    const xs = Array.from({ length: n + 1 }, (_, k) => (sx + k * ch).toFixed(1)).join(";");
    const ws = Array.from({ length: n + 1 }, (_, k) => ((n - k) * ch + 4).toFixed(1)).join(";");
    body += `<rect x="${sx}" y="${y - 18}" width="${(n * ch + 4).toFixed(1)}" height="26" fill="${C.panel}">
<animate attributeName="x" values="${xs}" dur="${(n * per).toFixed(2)}s" begin="${delay.toFixed(2)}s" calcMode="discrete" fill="freeze"/>
<animate attributeName="width" values="${ws}" dur="${(n * per).toFixed(2)}s" begin="${delay.toFixed(2)}s" calcMode="discrete" fill="freeze"/></rect>`;
    if (line.command) {
      body += `<rect x="${x - 2}" y="${y - 18}" width="${ch + 4}" height="26" fill="${C.panel}"><animate attributeName="opacity" values="1;0" dur="0.01s" begin="${(delay - 0.2).toFixed(2)}s" fill="freeze"/></rect>`;
    }
    delay += n * per + (line.command ? 0.35 : 0.15);
  });
  const caretY = ty + 70 + lines.length * 28;
  body += `<g opacity="0"><animate attributeName="opacity" values="0;1" dur="0.01s" begin="${delay.toFixed(2)}s" fill="freeze"/>${text(mono, "$", tx + 20, caretY, size14, C.acid)}${blink(tx + 20 + ch * 2, caretY - 14, 9, 18, C.acid)}</g>`;

  // Rotated ticker band.
  const items = ["GO", "TYPESCRIPT", "RUST", "FIGMA", "SKETCH", "SWIFT", ".NET", "MACOS", "IOS", "WINDOWS", "LINUX", "ANDROID", "WEB", "NSGO", "MCP"];
  let row = "";
  let cursor = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const item of items) {
      row += text(monoBold, item, cursor, 0, 17, C.void);
      cursor += width(monoBold, item, 17) + 22;
      row += sparkle(cursor, -6, 6, C.void);
      cursor += 28;
    }
  }
  const half = cursor / 2;
  body += `<g transform="rotate(-2 600 ${h - 46})"><rect x="-40" y="${h - 70}" width="${W + 80}" height="48" fill="${C.acid}"/>
<g transform="translate(0 ${h - 40})"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="${-half} 0" dur="30s" repeatCount="indefinite"/>${row}</g></g></g>`;

  body += backdropEnd(id, W, h);
  return svg(W, h, "ONEO — designer turned developer in Shanghai. I make native apps, and the frameworks underneath them.", body);
}

// ---------- write ----------

const out = ROOT + "assets/hero.svg";
const content = hero();
await Bun.write(out, content);
console.log(`assets/hero.svg ${(content.length / 1024).toFixed(0)} KB`);
