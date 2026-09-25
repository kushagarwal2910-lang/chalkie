import { ChromeBrowserSession } from './chrome-session.mjs';

async function runVisualCursorVerification() {
  const session = new ChromeBrowserSession(9340);
  try {
    console.log('Launching browser session...');
    await session.launch();

    console.log('Navigating to studio with Tokamak lesson...');
    await session.navigate('http://localhost:3000/studio?q=How+does+a+Tokamak+fusion+reactor+confine+plasma');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('Clicking Play Step 1...');
    const playRes = await session.eval(`
      (() => {
        const step1Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.includes("Central Solenoid") ||
          b.innerText?.includes("Central Solenoid")
        );
        if (step1Btn) {
          step1Btn.click();
          return "Clicked Step 1: " + step1Btn.innerText;
        }
        const playBtn = document.querySelector("button[aria-label*='Play' i], button[aria-label*='play' i]");
        if (playBtn) {
          playBtn.click();
          return "Clicked main play button";
        }
        return "No button found";
      })()
    `);
    console.log('Play button result:', playRes);

    // Wait 1.5s for initial pointer position
    await new Promise((r) => setTimeout(r, 1500));

    const cursorInfo1 = await session.eval(`
      (() => {
        const badge = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("border-rose-400") || d.className.includes("text-rose-100")
        );
        const spotlight = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("ring-cyan-400")
        );
        const beacon = document.querySelector(".bg-rose-500.animate-ping");
        const cursorContainer = beacon ? beacon.closest(".transition-transform") : null;
        
        return {
          badgeText: badge ? badge.innerText.trim() : null,
          hasBeacon: Boolean(beacon),
          cursorTransform: cursorContainer ? cursorContainer.style.transform : null,
          hasSpotlight: Boolean(spotlight),
          spotlightStyle: spotlight ? {
            left: spotlight.style.left,
            top: spotlight.style.top,
            width: spotlight.style.width,
            height: spotlight.style.height
          } : null
        };
      })()
    `);
    console.log('\nCursor state during Step 1:', cursorInfo1);

    await session.screenshot('scratch/screenshots/cursor_accuracy_step1.png');
    console.log('Saved screenshot: scratch/screenshots/cursor_accuracy_step1.png');

    // Wait until 7 seconds when speech progresses to Pulsed Current
    console.log('\nWaiting for voiceover progression to "pulsed current"...');
    await new Promise((r) => setTimeout(r, 6000));

    const cursorInfo2 = await session.eval(`
      (() => {
        const badge = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("border-rose-400") || d.className.includes("text-rose-100")
        );
        const spotlight = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("ring-cyan-400")
        );
        const beacon = document.querySelector(".bg-rose-500.animate-ping");
        const cursorContainer = beacon ? beacon.closest(".transition-transform") : null;
        
        return {
          badgeText: badge ? badge.innerText.trim() : null,
          hasBeacon: Boolean(beacon),
          cursorTransform: cursorContainer ? cursorContainer.style.transform : null,
          hasSpotlight: Boolean(spotlight),
          spotlightStyle: spotlight ? {
            left: spotlight.style.left,
            top: spotlight.style.top,
            width: spotlight.style.width,
            height: spotlight.style.height
          } : null
        };
      })()
    `);
    console.log('Cursor state during Step 1 Part 2 progression:', cursorInfo2);

    await session.screenshot('scratch/screenshots/cursor_accuracy_step1_part2.png');
    console.log('Saved screenshot: scratch/screenshots/cursor_accuracy_step1_part2.png');

  } catch (err) {
    console.error('Visual cursor verification failed:', err);
  } finally {
    await session.close();
  }
}

runVisualCursorVerification();
