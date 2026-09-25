import { ChromeBrowserSession } from './chrome-session.mjs';

async function runBrakesTest() {
  const session = new ChromeBrowserSession(9342);
  try {
    console.log('Launching browser session for Brakes...');
    await session.launch();

    await session.navigate('http://localhost:3000/studio?q=How+do+hydraulic+brakes+work');
    await new Promise((r) => setTimeout(r, 4500));

    console.log('Clicking Play Step 1...');
    await session.eval(`
      (() => {
        const step1Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.includes("Brake Pedal") ||
          b.innerText?.includes("Brake Pedal")
        );
        if (step1Btn) step1Btn.click();
        else {
          const playBtn = document.querySelector("button[aria-label*='Play' i]");
          if (playBtn) playBtn.click();
        }
      })()
    `);

    // Wait 2s for step 1 targeting
    await new Promise((r) => setTimeout(r, 2000));
    await session.screenshot('scratch/screenshots/brakes_step1_cursor.png');
    console.log('Saved: scratch/screenshots/brakes_step1_cursor.png');

    const state1 = await session.eval(`
      (() => {
        const badge = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("border-rose-400") || d.className.includes("text-rose-100")
        );
        return { badge: badge?.innerText.trim() };
      })()
    `);
    console.log('Brakes Step 1 badge:', state1);

    // Click step 4 (Caliper and Disc Rotor)
    console.log('Clicking Step 4 (Caliper & Rotor)...');
    await session.eval(`
      (() => {
        const step4Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.includes("Caliper") ||
          b.innerText?.includes("Caliper")
        );
        if (step4Btn) step4Btn.click();
      })()
    `);

    await new Promise((r) => setTimeout(r, 2000));
    await session.screenshot('scratch/screenshots/brakes_step4_cursor.png');
    console.log('Saved: scratch/screenshots/brakes_step4_cursor.png');

    const state4 = await session.eval(`
      (() => {
        const badge = Array.from(document.querySelectorAll("div")).find(d => 
          d.className.includes("border-rose-400") || d.className.includes("text-rose-100")
        );
        return { badge: badge?.innerText.trim() };
      })()
    `);
    console.log('Brakes Step 4 badge:', state4);

  } catch (err) {
    console.error('Brakes test error:', err);
  } finally {
    await session.close();
  }
}

runBrakesTest();
