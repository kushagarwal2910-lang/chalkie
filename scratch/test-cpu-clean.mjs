import { ChromeBrowserSession } from './chrome-session.mjs';

async function testCpuCleanLook() {
  const session = new ChromeBrowserSession(9348);
  try {
    console.log('Launching browser session for CPU...');
    await session.launch();

    console.log('Navigating to CPU lesson...');
    await session.navigate('http://localhost:3000/studio?q=Inside+a+CPU+-+The+ALU');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('Clicking Step 1...');
    await session.eval(`
      (() => {
        const step1Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.startsWith("Teach") ||
          b.getAttribute("aria-label")?.includes("1")
        );
        if (step1Btn) step1Btn.click();
        else {
          const play = document.querySelector("button[aria-label*='Play' i]");
          if (play) play.click();
        }
      })()
    `);

    await new Promise((r) => setTimeout(r, 2000));
    await session.screenshot('scratch/screenshots/cpu_clean_cursor_box.png');
    console.log('Saved: scratch/screenshots/cpu_clean_cursor_box.png');

    const domCheck = await session.eval(`
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
        };
      })()
    `);
    console.log('CPU DOM check:', domCheck);

  } catch (err) {
    console.error('CPU clean look error:', err);
  } finally {
    await session.close();
  }
}

testCpuCleanLook();
