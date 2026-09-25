import { ChromeBrowserSession } from './chrome-session.mjs';

async function testLock() {
  const session = new ChromeBrowserSession(9351);
  try {
    console.log('Launching browser session...');
    await session.launch();

    console.log('Navigating to lesson...');
    await session.navigate('http://localhost:3000/studio?q=How+does+a+Tokamak+fusion+reactor+confine+plasma');
    await new Promise((r) => setTimeout(r, 4500));

    for (let step = 1; step <= 4; step++) {
      console.log(`\nTesting Step ${step}...`);
      await session.eval(`
        (() => {
          const btn = Array.from(document.querySelectorAll("button")).find(b => 
            b.getAttribute("aria-label")?.startsWith("Teach " + ${step}) ||
            b.innerText?.startsWith("${step}")
          );
          if (btn) btn.click();
        })()
      `);

      await new Promise((r) => setTimeout(r, 1600));

      const data = await session.eval(`
        (() => {
          const spotlight = document.querySelector(".ring-cyan-400\\\\/80");
          const beacon = document.querySelector(".bg-rose-500.animate-ping");
          const cursorDiv = beacon ? beacon.closest(".transition-all, .transition-transform") : null;

          if (!spotlight || !cursorDiv) return { error: "elements missing", hasSpotlight: Boolean(spotlight), hasCursor: Boolean(cursorDiv) };

          const boxRect = spotlight.getBoundingClientRect();
          const cursorRect = beacon.getBoundingClientRect();

          const boxCenter = { x: boxRect.left + boxRect.width / 2, y: boxRect.top + boxRect.height / 2 };
          const cursorCenter = { x: cursorRect.left + cursorRect.width / 2, y: cursorRect.top + cursorRect.height / 2 };

          const dx = Math.abs(boxCenter.x - cursorCenter.x);
          const dy = Math.abs(boxCenter.y - cursorCenter.y);
          const isInside = (
            cursorCenter.x >= boxRect.left &&
            cursorCenter.x <= boxRect.right &&
            cursorCenter.y >= boxRect.top &&
            cursorCenter.y <= boxRect.bottom
          );

          // Verify NO pills or labels exist on either box or cursor
          const boxPill = spotlight.querySelector("span, div");
          const cursorPill = cursorDiv.querySelector(".bg-slate-900, .bg-slate-800, span.truncate");

          return {
            step: ${step},
            isInside,
            distanceFromCenter: Math.sqrt(dx * dx + dy * dy).toFixed(1) + "px",
            boxCenter: { x: boxCenter.x.toFixed(1), y: boxCenter.y.toFixed(1) },
            cursorCenter: { x: cursorCenter.x.toFixed(1), y: cursorCenter.y.toFixed(1) },
            hasBoxPill: Boolean(boxPill),
            hasCursorPill: Boolean(cursorPill)
          };
        })()
      `);

      console.log(`Step ${step} Lock Check:`, data);
      await session.screenshot(`scratch/screenshots/step_${step}_locked_perfect.png`);
    }

  } catch (err) {
    console.error('Lock test error:', err);
  } finally {
    await session.close();
  }
}

testLock();
