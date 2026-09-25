import { ChromeBrowserSession } from './chrome-session.mjs';

async function testCleanLook() {
  const session = new ChromeBrowserSession(9346);
  try {
    console.log('Launching browser session...');
    await session.launch();

    console.log('Navigating to Tokamak lesson...');
    await session.navigate('http://localhost:3000/studio?q=How+does+a+Tokamak+fusion+reactor+confine+plasma');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('Clicking Step 1...');
    await session.eval(`
      (() => {
        const step1Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.includes("Central Solenoid") ||
          b.innerText?.includes("Central Solenoid")
        );
        if (step1Btn) step1Btn.click();
      })()
    `);

    await new Promise((r) => setTimeout(r, 2000));
    await session.screenshot('scratch/screenshots/clean_cursor_box_step1.png');
    console.log('Saved: scratch/screenshots/clean_cursor_box_step1.png');

    const domCheck1 = await session.eval(`
      (() => {
        const activeFocusPill = Array.from(document.querySelectorAll("*")).find(el => 
          el.innerText?.trim() === "Active Focus" || el.innerText?.trim() === "ACTIVE FOCUS"
        );
        const cursorPill = document.querySelector(".whitespace-nowrap.border-rose-400\\\\/50");
        const spotlight = document.querySelector(".ring-cyan-400\\\\/80");
        const beacon = document.querySelector(".bg-rose-500.animate-ping");

        return {
          hasActiveFocusPill: Boolean(activeFocusPill),
          hasCursorPill: Boolean(cursorPill),
          hasSpotlightBox: Boolean(spotlight),
          hasLaserBeacon: Boolean(beacon),
          spotlightBoxPos: spotlight ? {
            left: spotlight.style.left,
            top: spotlight.style.top,
            width: spotlight.style.width,
            height: spotlight.style.height
          } : null
        };
      })()
    `);
    console.log('DOM check Step 1:', domCheck1);

    // Switch to step 2
    console.log('\nClicking Step 2...');
    await session.eval(`
      (() => {
        const step2Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.includes("Toroidal") ||
          b.innerText?.includes("Toroidal")
        );
        if (step2Btn) step2Btn.click();
      })()
    `);

    await new Promise((r) => setTimeout(r, 2000));
    await session.screenshot('scratch/screenshots/clean_cursor_box_step2.png');
    console.log('Saved: scratch/screenshots/clean_cursor_box_step2.png');

    const domCheck2 = await session.eval(`
      (() => {
        const activeFocusPill = Array.from(document.querySelectorAll("*")).find(el => 
          el.innerText?.trim() === "Active Focus" || el.innerText?.trim() === "ACTIVE FOCUS"
        );
        const cursorPill = document.querySelector(".whitespace-nowrap.border-rose-400\\\\/50");
        const spotlight = document.querySelector(".ring-cyan-400\\\\/80");

        return {
          hasActiveFocusPill: Boolean(activeFocusPill),
          hasCursorPill: Boolean(cursorPill),
          hasSpotlightBox: Boolean(spotlight),
          spotlightBoxPos: spotlight ? {
            left: spotlight.style.left,
            top: spotlight.style.top,
            width: spotlight.style.width,
            height: spotlight.style.height
          } : null
        };
      })()
    `);
    console.log('DOM check Step 2:', domCheck2);

  } catch (err) {
    console.error('Clean look test error:', err);
  } finally {
    await session.close();
  }
}

testCleanLook();
