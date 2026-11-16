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

/** Cyan and pink copies of a path that flash in offset slices now and then, like the site's wordmark. */
function glitch(id: string, d: string, top: number, height: number, period = 3.2) {
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
<g clip-path="url(#${id}-${name})"><path d="${d}" fill="${color}" transform="translate(${dx} 0)"/></g>`;
  return layer("a", C.cyan, "-8", a, period) + layer("b", C.pink, "8", b, period * 0.84);
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
  const mark = pathData(display.getPath("ONEO", 40, baseline, size));
  body += `<path d="${mark}" fill="${C.text}"/>`;
  body += glitch(id, mark, baseline - size * 0.72, size * 0.74);

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
