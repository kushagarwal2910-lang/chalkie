import { ChromeBrowserSession } from './chrome-session.mjs';
import fs from 'node:fs';
import path from 'node:path';

const testCases = [
  {
    name: 'ocean_currents',
    query: 'Why do ocean currents circulate?',
    expectedObjects: ['equatorial-heating', 'coriolis-deflection', 'surface-gyres', 'thermohaline-conveyor']
  },
  {
    name: 'airplane_flight',
    query: 'How does an airplane fly?',
    expectedObjects: ['airfoil-camber', 'streamline-flow', 'aerodynamic-lift', 'lift-equation']
  },
  {
    name: '4_stroke_engine',
    query: 'How does a car engine work?',
    expectedObjects: ['intake-stroke', 'compression-stroke', 'power-stroke', 'exhaust-stroke']
  },
  {
    name: 'crispr_cas9',
    query: 'How does CRISPR-Cas9 edit DNA?',
    expectedObjects: ['cas9-enzyme', 'guide-rna', 'target-dna', 'cleavage-dsb']
  },
  {
    name: 'hydraulic_brakes',
    query: 'How does a hydraulic braking system work?',
    expectedObjects: ['brake-pedal', 'master-cylinder', 'hydraulic-lines', 'caliper-rotor']
  },
  {
    name: 'solar_eclipse',
    query: 'What causes a solar eclipse?',
    expectedObjects: ['eclipse-sun', 'eclipse-moon', 'shadow-cones', 'eclipse-earth']
  },
  {
    name: 'quantum_superposition',
    query: 'How does quantum superposition work in computing?',
    expectedObjects: ['classical-vs-qubit', 'bloch-sphere-state', 'hadamard-transformation', 'measurement-born-rule']
  }
];

async function runVisualSuite() {
  const browser = new ChromeBrowserSession(9345);
  const screenshotDir = path.resolve('scratch/screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const summary = [];

  try {
    console.log("Launching headless Chrome for full visual inspection...");
    await browser.launch();
    console.log("Chrome launched successfully.");

    for (const tc of testCases) {
      console.log(`\n============================================================`);
      console.log(`Testing topic: "${tc.query}" (${tc.name})`);

      // Clear local storage and navigate directly
      await browser.navigate(`http://localhost:3000/studio?q=${encodeURIComponent(tc.query)}`);

      let loaded = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const status = await browser.eval(`({
          shapeCount: document.querySelectorAll('.tl-shape').length,
          hasError: Array.from(document.querySelectorAll('*')).some(el => el.textContent === 'Error' || el.innerText === 'Error'),
          isPulse: !!document.querySelector('.animate-pulse')
        })`);

        if (status.shapeCount >= 4 && !status.isPulse) {
          loaded = true;
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 1500));

      const screenshotPath = path.join(screenshotDir, `${tc.name}.png`);
      await browser.screenshot(screenshotPath);
      console.log(`📸 Screenshot saved: ${screenshotPath}`);

      const audit = await browser.eval(`(() => {
        const shapes = Array.from(document.querySelectorAll('.tl-shape'));
        const chalkShapes = shapes.filter(s => s.getAttribute('data-shape-type') === 'chalk-visual');
        const arrowShapes = shapes.filter(s => s.getAttribute('data-shape-type') === 'arrow');
        const hasError = Array.from(document.querySelectorAll('*')).some(el => el.textContent === 'Error' || el.innerText === 'Error');
        
        // Extract texts from inside custom shapes
        const shapeDetails = chalkShapes.map(s => {
          const rect = s.getBoundingClientRect();
          const texts = Array.from(s.querySelectorAll('text, span, p')).map(t => t.textContent.trim()).filter(Boolean);
          return {
            id: s.getAttribute('data-shape-id') || '',
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            texts
          };
        });

        // Extract arrow details
        const arrowDetails = arrowShapes.map(a => {
          const rect = a.getBoundingClientRect();
          const texts = Array.from(a.querySelectorAll('text, span, p')).map(t => t.textContent.trim()).filter(Boolean);
          return {
            id: a.getAttribute('data-shape-id') || '',
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            texts
          };
        });

        return {
          totalShapes: shapes.length,
          chalkCount: chalkShapes.length,
          arrowCount: arrowShapes.length,
          hasError,
          shapeDetails,
          arrowDetails
        };
      })()`);

      console.log(`Audit for ${tc.name}:`, JSON.stringify({
        chalkShapes: audit.chalkCount,
        arrowShapes: audit.arrowCount,
        hasError: audit.hasError,
        sampleShapeTexts: audit.shapeDetails.map(s => ({ id: s.id, texts: s.texts.slice(0, 3) })),
        arrowTexts: audit.arrowDetails.map(a => a.texts)
      }, null, 2));

      summary.push({
        name: tc.name,
        chalkCount: audit.chalkCount,
        arrowCount: audit.arrowCount,
        hasError: audit.hasError,
        screenshot: screenshotPath
      });
    }

    console.log("\n============================================================");
    console.log("FINAL VISUAL SUITE SUMMARY:");
    console.table(summary);

  } catch (err) {
    console.error("Suite failed with error:", err);
  } finally {
    await browser.close();
  }
}

runVisualSuite();
