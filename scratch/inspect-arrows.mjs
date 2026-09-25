import { ChromeBrowserSession } from './chrome-session.mjs';

async function inspectArrows() {
  const session = new ChromeBrowserSession(9342);
  try {
    await session.launch();
    await session.navigate('http://localhost:3000/studio?q=How+does+a+Tokamak+fusion+reactor+confine+plasma');
    await new Promise((r) => setTimeout(r, 4000));

    // Click step 2 to see the arrow
    await session.eval(`
      (() => {
        const step2 = Array.from(document.querySelectorAll("button")).find(b => b.getAttribute("aria-label")?.includes("Toroidal"));
        if (step2) step2.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const arrowDom = await session.eval(`
      (() => {
        const arrowShapes = Array.from(document.querySelectorAll('[data-shape-type="arrow"]'));
        return arrowShapes.map(shape => {
          const textEl = shape.querySelector('.tl-text, [class*="label"], [class*="text"]');
          return {
            id: shape.getAttribute('data-shape-id'),
            innerHTML: shape.innerHTML,
            textElHtml: textEl ? textEl.outerHTML : null,
            textElClasses: textEl ? textEl.className : null
          };
        });
      })()
    `);
    console.log('Arrow DOM Info:', JSON.stringify(arrowDom, null, 2));
  } finally {
    await session.close();
  }
}

inspectArrows();
