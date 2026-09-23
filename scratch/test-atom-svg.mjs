// Test generating SVG for orbit, cluster, and quarks

function generateOrbitSvg(cx, cy, radius, electronCount) {
  const electronElements = [];
  for (let i = 0; i < electronCount; i++) {
    const angle = (i / electronCount) * Math.PI * 2 - Math.PI / 2;
    const ex = (cx + radius * Math.cos(angle)).toFixed(1);
    const ey = (cy + radius * Math.sin(angle)).toFixed(1);
    electronElements.push(
      `<g class="electron" transform="translate(${ex}, ${ey})">` +
      `<circle r="5" fill="#06b6d4" stroke="#0891b2" stroke-width="1.5" />` +
      `<text y="1" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="900">-</text>` +
      `</g>`
    );
  }

  return (
    `<g class="orbit-shell">` +
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.8" />` +
    electronElements.join("") +
    `</g>`
  );
}

function generateNucleusSvg(cx, cy, protonCount = 6, neutronCount = 6) {
  const total = protonCount + neutronCount;
  const sphereRadius = 7;
  const particles = [];

  // Alternating protons and neutrons
  let pLeft = protonCount;
  let nLeft = neutronCount;
  const types = [];
  for (let i = 0; i < total; i++) {
    if (i % 2 === 0 && pLeft > 0) {
      types.push("proton");
      pLeft--;
    } else if (nLeft > 0) {
      types.push("neutron");
      nLeft--;
    } else {
      types.push("proton");
    }
  }

  // Pack in Fermat spiral
  for (let i = 0; i < total; i++) {
    const r = i === 0 ? 0 : sphereRadius * Math.sqrt(i) * 0.95;
    const theta = i * 2.39996323; // golden angle
    const px = (cx + r * Math.cos(theta)).toFixed(1);
    const py = (cy + r * Math.sin(theta)).toFixed(1);
    const isProton = types[i] === "proton";
    const fill = isProton ? "#dc2626" : "#2563eb";
    const stroke = isProton ? "#b91c1c" : "#1d4ed8";
    const symbol = isProton ? "+" : "n";

    particles.push(
      `<g class="nucleon" transform="translate(${px}, ${py})">` +
      `<circle r="${sphereRadius}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />` +
      `<text y="1" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="800">${symbol}</text>` +
      `</g>`
    );
  }

  return `<g class="nucleus-cluster">${particles.join("")}</g>`;
}

function generateQuarkSvg(cx, cy, flavorString = "u,u,d") {
  const flavors = flavorString.split(",").map(s => s.trim().toLowerCase());
  const r = 32;
  const quarkRadius = 13;
  const elements = [];

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const qx = (cx + r * Math.cos(angle)).toFixed(1);
    const qy = (cy + r * Math.sin(angle)).toFixed(1);
    const flavor = flavors[i] || "u";
    const isUp = flavor === "u";
    const fill = isUp ? "#2563eb" : "#dc2626";
    const stroke = isUp ? "#1d4ed8" : "#b91c1c";
    const charge = isUp ? "+2/3" : "-1/3";

    elements.push(
      `<g class="quark" transform="translate(${qx}, ${qy})">` +
      `<circle r="${quarkRadius}" fill="${fill}" stroke="${stroke}" stroke-width="2" />` +
      `<text y="-1" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="11" font-weight="900">${flavor}</text>` +
      `<text y="18" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-size="9" font-weight="700">${charge}</text>` +
      `</g>`
    );
  }

  return `<g class="quark-triplet">${elements.join("")}</g>`;
}

console.log("Orbit SVG sample:\n", generateOrbitSvg(200, 200, 80, 4));
console.log("\nNucleus SVG sample:\n", generateNucleusSvg(200, 200, 6, 6));
console.log("\nQuark SVG sample:\n", generateQuarkSvg(60, 60, "u,u,d"));
