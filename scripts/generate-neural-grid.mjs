import fs from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
if (!token) throw new Error("GITHUB_TOKEN is required.");
if (!login) throw new Error("PROFILE_LOGIN or GITHUB_REPOSITORY_OWNER is required.");

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-profile-neural-grid"
  },
  body: JSON.stringify({ query, variables: { login } })
});
if (!response.ok) throw new Error(`GitHub GraphQL request failed: ${response.status} ${await response.text()}`);
const payload = await response.json();
if (payload.errors) throw new Error(JSON.stringify(payload.errors));
const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) throw new Error("No contribution calendar returned.");

const weeks = calendar.weeks || [];
const allDays = weeks.flatMap(w => w.contributionDays || []);
const max = Math.max(1, ...allDays.map(d => d.contributionCount));
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const intensity = (count) => {
  if (count <= 0) return 0;
  const ratio = count / max;
  if (ratio <= .2) return 1;
  if (ratio <= .45) return 2;
  if (ratio <= .7) return 3;
  return 4;
};
const fills = ["#102235", "#123D63", "#1769A5", "#2C9DFF", "#FF7A00"];
const width = 1400, height = 430, startX = 62, startY = 150, gap = 22, node = 13;
let lines = "", nodes = "";
const points = [];

weeks.forEach((week, wi) => {
  (week.contributionDays || []).forEach(day => {
    const x = startX + wi * gap;
    const y = startY + day.weekday * gap;
    const level = intensity(day.contributionCount);
    if (day.contributionCount > 0) points.push({ x, y, wi, weekday: day.weekday, count: day.contributionCount });
    nodes += `<rect x="${x}" y="${y}" width="${node}" height="${node}" rx="3" fill="${fills[level]}" stroke="${level ? "#63BFFF" : "#17324A"}" stroke-width="${level ? 1.2 : .7}"><title>${esc(day.date)} — ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title></rect>`;
  });
});

for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  if (b.wi - a.wi <= 2 && Math.abs(b.weekday - a.weekday) <= 2) {
    lines += `<path d="M${a.x + node/2} ${a.y + node/2} L${b.x + node/2} ${b.y + node/2}" stroke="url(#energy)" stroke-width="1.1" opacity=".23"/>`;
  }
}

const firstDate = allDays[0]?.date || "";
const lastDate = allDays.at(-1)?.date || "";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06111E"/><stop offset="58%" stop-color="#0B2B4A"/><stop offset="100%" stop-color="#07121D"/></linearGradient>
<linearGradient id="energy" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1687FF"/><stop offset="100%" stop-color="#FF7A00"/></linearGradient>
<filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<style>.pulse{offset-path:path("M80 375 C360 300 560 425 795 335 S1115 292 1320 358");animation:travel 7s linear infinite}@keyframes travel{from{offset-distance:0%}to{offset-distance:100%}}</style>
</defs>
<rect width="${width}" height="${height}" rx="30" fill="url(#bg)"/>
<text x="60" y="62" fill="#FFFFFF" font-family="Arial,Segoe UI,sans-serif" font-size="31" font-weight="800">CONTRIBUTION NEURAL GRID</text>
<text x="60" y="98" fill="#91B8D7" font-family="Arial,Segoe UI,sans-serif" font-size="18">${esc(login)} • ${calendar.totalContributions} contributions • ${esc(firstDate)} → ${esc(lastDate)}</text>
<g>${lines}</g><g>${nodes}</g>
<path d="M80 375 C360 300 560 425 795 335 S1115 292 1320 358" fill="none" stroke="url(#energy)" stroke-width="2.5" opacity=".45"/>
<circle class="pulse" r="8" fill="#FF7A00" filter="url(#glow)"/>
<text x="60" y="409" fill="#6E94B2" font-family="Arial,Segoe UI,sans-serif" font-size="16">Every contribution is a node. Connected work becomes a system.</text>
</svg>`;

await fs.mkdir("assets", { recursive: true });
await fs.writeFile("assets/neural-contributions.svg", svg, "utf8");
console.log(`Generated neural grid for ${login}: ${calendar.totalContributions} contributions.`);
