import assert from "node:assert/strict";
import test from "node:test";
import { verifyPageStyles } from "../scripts/verify-build-styles.mjs";

const currentCss = ".studio-shell{display:flex}.studio-header{display:flex}.studio-panel,.studio-board{min-height:0}.studio-composer{padding:12px}@media(max-width:1099px){.studio-mobile-tabs{display:grid}}";
const page = (name) => `<head><link rel="preload" href="/_next/static/unused.css"/><link href="/_next/static/${name}.css" rel="stylesheet"/></head>`;

test("built page loads all notebook layout rules from its linked CSS", () => {
  assert.deepEqual(verifyPageStyles(page("current"), () => currentCss), ["/_next/static/current.css"]);
});

test("old linked CSS is rejected even when fresh CSS exists in the build", () => {
  const assets = { "/_next/static/old.css": ":root{--background:#090a0f}", "/_next/static/current.css": currentCss };
  assert.throws(() => verifyPageStyles(page("old"), (href) => assets[href]), /missing .studio-shell/);
});

test("missing responsive rules and missing stylesheets fail the deployment check", () => {
  assert.throws(() => verifyPageStyles(page("partial"), () => currentCss.replace(/\.studio-mobile-tabs\{display:grid\}/, "")), /missing .studio-mobile-tabs/);
  assert.throws(() => verifyPageStyles("<head></head>", () => currentCss), /no stylesheet links/);
});
