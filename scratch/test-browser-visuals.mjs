import { ChromeBrowserSession } from './chrome-session.mjs';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const browser = new ChromeBrowserSession(9340);
  try {
    console.log("Launching headless Chrome on port 9340...");
    await browser.launch();
    console.log("Chrome launched.");

    // Test Case 1: Ocean currents & Coriolis effect
    const q1 = "Why do ocean currents circulate?";
    console.log(`Navigating to /studio with query: ${q1}`);
    await browser.navigate(`http://localhost:3000/studio?q=${encodeURIComponent(q1)}`);

    // Wait for the lesson to generate and load
    console.log("Waiting for lesson generation...");
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await browser.eval(`({
        title: document.querySelector('h1')?.textContent || '',
        subTitle: document.querySelector('header h2')?.textContent || '',
        isGenerating: !!document.querySelector('.animate-pulse'),
        shapeCount: document.querySelectorAll('.tl-shape').length,
        hasCanvas: !!document.querySelector('.tl-container'),
        stage: document.body.innerText.includes('Demo lesson ready') || document.body.innerText.includes('Lesson ready')
      })`);
      console.log(`Check ${i + 1}:`, JSON.stringify(status));
      if (status.shapeCount > 0 && !status.isGenerating) {
        console.log("Shapes detected!");
        break;
      }
    }

    // Wait 2 more seconds for stable render
    await new Promise((r) => setTimeout(r, 2000));

    const screenshotDir = path.resolve('scratch/screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    const p1 = path.join(screenshotDir, 'ocean_currents_studio.png');
    await browser.screenshot(p1);
    console.log(`Saved screenshot 1 to: ${p1}`);

    // Inspect shapes and texts
    const domInfo = await browser.eval(`(() => {
      const shapes = Array.from(document.querySelectorAll('.tl-shape')).map(s => {
        const textElements = Array.from(s.querySelectorAll('text, span, p')).map(t => t.textContent.trim()).filter(Boolean);
        const rect = s.getBoundingClientRect();
        return {
          id: s.getAttribute('data-shape-id') || '',
          type: s.getAttribute('data-shape-type') || '',
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          texts: textElements
        };
      });
      return {
        shapesCount: shapes.length,
        shapes: shapes.slice(0, 10),
        activeStep: document.querySelector('[data-active-step]')?.textContent || '',
        narration: document.querySelector('.italic')?.textContent || ''
      };
    })()`);
    console.log("DOM inspection result:", JSON.stringify(domInfo, null, 2));

  } catch (err) {
    console.error("Error during visual test:", err);
  } finally {
    await browser.close();
  }
}

main();
