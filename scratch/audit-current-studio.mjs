import { ChromeBrowserSession } from './chrome-session.mjs';

async function audit() {
  const session = new ChromeBrowserSession(9335);
  try {
    console.log('1. Launching Chrome...');
    await session.launch();

    console.log('2. Navigating to http://localhost:3000/studio...');
    await session.navigate('http://localhost:3000/studio');
    await new Promise((r) => setTimeout(r, 3000));

    // Check page title and DOM state
    const title = await session.eval('document.title');
    console.log('Page Title:', title);

    // Check if canvas is rendered
    const canvasExists = await session.eval('Boolean(document.querySelector(".tl-container"))');
    console.log('tldraw canvas rendered:', canvasExists);

    // Check shapes count
    const shapeCount = await session.eval('document.querySelectorAll("[data-shape-id]").length');
    console.log('Rendered shape count:', shapeCount);

    // Capture initial screenshot
    const shot1 = await session.screenshot('scratch/screenshots/initial-studio.png');
    console.log('Saved screenshot:', shot1);

    // Now test navigating with a query to generate a lesson: CRISPR
    console.log('3. Navigating with ?q=CRISPR-Cas9+Gene+Editing...');
    await session.navigate('http://localhost:3000/studio?q=How+does+CRISPR-Cas9+edit+DNA');
    await new Promise((r) => setTimeout(r, 4000));

    const crisprShapes = await session.eval('document.querySelectorAll("[data-shape-id]").length');
    console.log('CRISPR shape count:', crisprShapes);

    const shot2 = await session.screenshot('scratch/screenshots/crispr-studio.png');
    console.log('Saved CRISPR screenshot:', shot2);

    // Inspect shape labels and SVG elements on the canvas
    const shapeDetails = await session.eval(`
      Array.from(document.querySelectorAll("[data-shape-id]")).map(el => {
        const id = el.getAttribute("data-shape-id");
        const text = el.innerText || "";
        const rect = el.getBoundingClientRect();
        return { id, text: text.trim().slice(0, 50), w: Math.round(rect.width), h: Math.round(rect.height), x: Math.round(rect.x), y: Math.round(rect.y) };
      })
    `);
    console.log('Shape Details:', JSON.stringify(shapeDetails, null, 2));

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await session.close();
  }
}

audit();
