// Construit les pages du wiki GitHub à partir du dépôt : pages rédigées de
// wiki/, guides de docs/ (liens réécrits) et une page « État du dépôt »
// calculée depuis le code. Publié par .github/workflows/wiki.yml à chaque
// fusion sur main ; le wiki ne se modifie donc jamais à la main.
//
// Usage : node scripts/build-wiki.cjs <dossier-de-sortie> [--strict]
// --strict échoue si un lien relatif pointe vers un fichier absent.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const repo = process.env.GITHUB_REPOSITORY || "groupebienoubien/BienDecider";
const repoUrl = `https://github.com/${repo}`;

// Fichier source -> nom de page du wiki. Un guide absent d'ici garde son nom de fichier.
const PAGE_NAMES = {
  "README.md": "Presentation",
  "docs/ci-cd.md": "CI-CD",
  "docs/github-tracking.md": "Suivi-des-US",
  "docs/cible-produit.md": "Cible-produit",
  "docs/architecture.md": "Architecture",
  "docs/delegation-risk-admin.md": "Risques-de-delegation",
  "docs/oauth-setup.md": "Configuration-OAuth",
  "docs/domain-email-setup.md": "Domaine-et-email",
  "docs/process-build-agentique.md": "Processus-de-build-agentique",
};

const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const list = (dir, filter) => (exists(dir) ? fs.readdirSync(path.join(root, dir), { recursive: true }) : [])
  .map((file) => `${dir}/${String(file).split(path.sep).join("/")}`)
  .filter(filter)
  .sort();
const git = (...args) => {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); } catch { return ""; }
};
const table = (headers, rows) => rows.length
  ? [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n")
  : "_Aucun élément._";
const code = (value) => `\`${value}\``;
const blob = (file) => `${repoUrl}/blob/main/${file}`;

function sourcePages() {
  const guides = list("docs", (file) => file.endsWith(".md") && file.split("/").length === 2);
  const pages = new Map();
  for (const file of ["README.md", ...guides]) pages.set(file, PAGE_NAMES[file] || path.basename(file, ".md"));
  for (const file of list("wiki", (name) => name.endsWith(".md"))) pages.set(file, path.basename(file, ".md"));
  // Page calculée, sans fichier source : les pages de wiki/ y renvoient par ce nom.
  pages.set("wiki/Etat-du-depot.md", "Etat-du-depot");
  return pages;
}

const broken = [];

// Liens relatifs d'un guide : vers une autre page du wiki si la cible en est une, sinon vers le fichier sur main.
function rewriteLinks(markdown, sourceFile, pages) {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return match;
    const [file, anchor] = target.split("#");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), file));
    const suffix = anchor ? `#${anchor}` : "";
    if (pages.has(resolved)) return `](${pages.get(resolved)}${suffix})`;
    if (!exists(resolved)) {
      broken.push(`${sourceFile} -> ${target}`);
      return match;
    }
    const kind = fs.statSync(path.join(root, resolved)).isDirectory() ? "tree" : "blob";
    return `](${repoUrl}/${kind}/main/${resolved}${suffix})`;
  });
}

function workflows() {
  return list(".github/workflows", (file) => /\.ya?ml$/.test(file)).map((file) => {
    const text = read(file);
    const name = (text.match(/^name:\s*(.+)$/m) || [])[1] || path.basename(file);
    const on = (text.match(/^on:\n((?:[ \t]+.*\n|\n)*)/m) || [])[1] || "";
    const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((found) => found[1]);
    return [`[${name}](${blob(file)})`, triggers.map(code).join(", ")];
  });
}

function apiRoutes() {
  return list("src/app/api", (file) => file.endsWith("/route.ts")).map((file) => {
    const methods = [...read(file).matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((found) => found[1]);
    const url = file.replace("src/app", "").replace("/route.ts", "");
    return [code(url), methods.join(", "), `[source](${blob(file)})`];
  });
}

function appPages() {
  return list("src/app", (file) => file.endsWith("/page.tsx") || file === "src/app/page.tsx")
    .map((file) => [code(file.replace("src/app", "").replace(/\/?page\.tsx$/, "") || "/"), `[source](${blob(file)})`]);
}

function models() {
  if (!exists("prisma/schema.prisma")) return [];
  return [...read("prisma/schema.prisma").matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map((found) => {
    const fields = found[2].split("\n").map((line) => line.trim()).filter((line) => /^\w+\s+\w/.test(line));
    return [code(found[1]), String(fields.length), fields.map((line) => line.split(/\s+/)[0]).slice(0, 8).join(", ") + (fields.length > 8 ? ", …" : "")];
  });
}

function envNames() {
  const names = new Set();
  const sources = [...list("src", (file) => /\.tsx?$/.test(file)), ...list("scripts", (file) => file.endsWith(".cjs")), "prisma.config.ts"];
  for (const file of sources.filter(exists)) for (const found of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(found[1]);
  return [...names].sort();
}

function codeOwners() {
  if (!exists(".github/CODEOWNERS")) return [];
  return read(".github/CODEOWNERS").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
    .map((line) => { const [target, ...owners] = line.split(/\s+/); return [code(target), owners.join(" ")]; });
}

function repositoryState() {
  const pkg = JSON.parse(read("package.json"));
  const migrations = list("prisma/migrations", (file) => file.endsWith("/migration.sql")).map((file) => code(file.split("/")[2]));
  const tests = list("tests", (file) => file.endsWith(".spec.ts")).map((file) => `[${path.basename(file)}](${blob(file)})`);
  const version = (name) => (pkg.dependencies?.[name] || pkg.devDependencies?.[name] || "absent").replace(/^[\^~]/, "");
  return [
    "Cette page est calculée depuis le code à chaque fusion sur `main`. Elle dit ce qui existe, pas pourquoi : les explications sont dans les guides.",
    "## Versions",
    table(["Composant", "Version"], ["next", "react", "prisma", "@anthropic-ai/sdk", "@playwright/test", "typescript"].map((name) => [code(name), version(name)])),
    "## Commandes npm",
    table(["Commande", "Ce qu'elle lance"], Object.entries(pkg.scripts || {}).map(([name, command]) => [code(`npm run ${name}`), code(command)])),
    "## Workflows GitHub Actions",
    table(["Workflow", "Déclencheurs"], workflows()),
    "## Fichiers à relecture obligatoire",
    codeOwners().length ? "Une PR qui touche l'un de ces chemins exige l'approbation de l'autre fondateur ([CODEOWNERS](" + blob(".github/CODEOWNERS") + ")).\n\n" + table(["Chemin", "Propriétaires"], codeOwners()) : "_Pas de fichier CODEOWNERS._",
    "## Pages de l'application",
    table(["Adresse", "Code"], appPages()),
    "## Routes API",
    "Toute nouvelle route doit être déclarée dans `tests/security.spec.ts` quand ce fichier existe, sinon la CI échoue.\n\n" + table(["Route", "Méthodes", "Code"], apiRoutes()),
    "## Modèle de données",
    `Source : [prisma/schema.prisma](${blob("prisma/schema.prisma")}). Migrations versionnées : ${migrations.join(", ") || "aucune"}.\n\n` + table(["Table", "Champs", "Premiers champs"], models()),
    "## Variables d'environnement lues par le code",
    "Seuls les noms figurent ici. Les valeurs vivent dans Vercel et dans le fichier `.env` local, jamais dans le dépôt.\n\n" + envNames().map(code).join(", "),
    "## Tests",
    tests.join(", ") || "_Aucun._",
  ].join("\n\n") + "\n";
}

function build(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const pages = sourcePages();
  const written = new Set();
  const write = (name, content) => {
    if (written.has(name)) throw new Error(`Deux sources produisent la page ${name}.`);
    written.add(name);
    fs.writeFileSync(path.join(outDir, `${name}.md`), content);
  };

  for (const file of list("wiki", (name) => name.endsWith(".md"))) write(path.basename(file, ".md"), rewriteLinks(read(file), file, pages));
  for (const [file, name] of pages) {
    if (file.startsWith("wiki/")) continue;
    const notice = `> Page générée depuis [\`${file}\`](${blob(file)}). Pour la corriger, modifier ce fichier dans une PR : toute modification faite ici est écrasée.\n\n`;
    write(name, notice + rewriteLinks(read(file), file, pages));
  }
  write("Etat-du-depot", repositoryState());

  const commit = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  const branch = process.env.GITHUB_REF_NAME || git("rev-parse", "--abbrev-ref", "HEAD");
  const date = git("log", "-1", "--format=%cs", commit) || "date inconnue";
  write("_Footer", `Wiki généré depuis le commit [\`${commit.slice(0, 7)}\`](${repoUrl}/commit/${commit}) de \`${branch}\`, du ${date}. Ne pas modifier ici : [comment corriger une page](Home#corriger-une-page).\n`);
  return [...written].sort();
}

const args = process.argv.slice(2);
const outDir = args.find((arg) => !arg.startsWith("--"));
if (!outDir) {
  console.error("Usage : node scripts/build-wiki.cjs <dossier-de-sortie> [--strict]");
  process.exit(1);
}
const pagesWritten = build(path.resolve(outDir));
console.log(`${pagesWritten.length} pages écrites dans ${outDir} : ${pagesWritten.join(", ")}`);
if (broken.length) {
  console.error(`Liens relatifs vers un fichier absent :\n- ${broken.join("\n- ")}`);
  if (args.includes("--strict")) process.exit(1);
}
