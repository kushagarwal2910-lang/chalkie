import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Validate the files referenced by each generated page. Finding a fresh CSS
// file elsewhere in .next is insufficient if the HTML still links an old one.
const notebookSelectors = [
  "studio-shell", "studio-header", "studio-panel", "studio-board",
  "studio-composer", "studio-mobile-tabs",
];

export function verifyPageStyles(html, readStylesheet) {
  const links = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => /\brel="stylesheet"/.test(tag) ? tag.match(/\bhref="([^"]+)"/)?.[1] : null)
    .filter(Boolean);
  assert.ok(links.length, "The built page has no stylesheet links");
  const css = [...new Set(links)].map((href) => readStylesheet(href)).join("\n");
  for (const selector of notebookSelectors) {
    assert.match(css, new RegExp(`\\.${selector}(?=[\\s,{:.])`), `The built page is missing .${selector}; refusing to deploy stale notebook styles`);
  }
  return [...new Set(links)];
}

export function verifyBuildStyles(buildDirectory = resolve(".next")) {
  const buildRoot = resolve(buildDirectory);
  return ["index", "studio"].map((page) => {
    const html = readFileSync(resolve(buildRoot, "server/app", `${page}.html`), "utf8");
    const styles = verifyPageStyles(html, (href) => {
      assert.ok(href.startsWith("/_next/static/"), `Unexpected stylesheet URL: ${href}`);
      const path = resolve(buildRoot, href.slice("/_next/".length));
      assert.ok(path.startsWith(buildRoot + sep), "Stylesheet must stay inside the build directory");
      return readFileSync(path, "utf8");
    });
    return { page: page === "index" ? "/" : "/studio", styles };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const result of verifyBuildStyles()) console.log(`PASS ${result.page} references the complete notebook stylesheet`);
}
