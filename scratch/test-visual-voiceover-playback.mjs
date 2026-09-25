import { ChromeBrowserSession } from './chrome-session.mjs';

async function runVisualVoiceoverTest() {
  const session = new ChromeBrowserSession(9338);
  try {
    console.log('Launching headless Chrome browser...');
    await session.launch();

    console.log('\n--- 1. Testing Out-of-the-Box Edge Case: Tokamak Fusion Reactor ---');
    await session.navigate('http://localhost:3000/studio?q=How+does+a+Tokamak+fusion+reactor+confine+plasma');
    await new Promise((r) => setTimeout(r, 4500));

    // Capture initial static layout overview
    await session.screenshot('scratch/screenshots/tokamak_overview.png');
    console.log('Saved: scratch/screenshots/tokamak_overview.png');

    // Trigger playback by clicking the Play button or Step 1
    console.log('Clicking Play to start voiceover playback...');
    const playResult = await session.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const playBtn = buttons.find(b => 
          b.innerText.toLowerCase().includes("play") || 
          b.getAttribute("aria-label")?.toLowerCase().includes("play") || 
          b.getAttribute("title")?.toLowerCase().includes("play")
        );
        if (playBtn) {
          playBtn.click();
          return "clicked play button: " + (playBtn.getAttribute("aria-label") || playBtn.innerText);
        }
        const firstStep = buttons.find(b => b.getAttribute("aria-label")?.startsWith("Teach "));
        if (firstStep) {
          firstStep.click();
          return "clicked first step button: " + firstStep.getAttribute("aria-label");
        }
        return "play button not found";
      })()
    `);
    console.log('Play action:', playResult);

    // Wait 1.8 seconds for laser pointer and spotlight halo to activate
    await new Promise((r) => setTimeout(r, 1800));
    await session.screenshot('scratch/screenshots/tokamak_step1_playback.png');
    console.log('Saved: scratch/screenshots/tokamak_step1_playback.png');

    // Inspect active laser cursor and spotlight element
    const step1Info = await session.eval(`({
      hasLaserPointer: Boolean(document.querySelector(".animate-ping, .bg-rose-500")),
      laserLabel: document.querySelector(".whitespace-nowrap.border-rose-400\\\\/50, .border-rose-400")?.innerText || "",
      activeSpotlight: Boolean(document.querySelector(".ring-cyan-400\\\\/85, .ring-amber-400\\\\/80")),
      activeFocusTag: document.querySelector(".text-cyan-300.font-bold")?.innerText || ""
    })`);
    console.log('Step 1 Voiceover Visual State:', step1Info);

    // Switch to step 2 (Toroidal Field Magnets)
    console.log('\nClicking Step 2 to test voiceover transition...');
    const step2Result = await session.eval(`
      (() => {
        const step2Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.toLowerCase().includes("toroidal") ||
          b.innerText.toLowerCase().includes("toroidal")
        );
        if (step2Btn) {
          step2Btn.click();
          return "clicked step 2: " + (step2Btn.getAttribute("aria-label") || step2Btn.innerText);
        }
        return "step 2 button not found";
      })()
    `);
    console.log('Step 2 action:', step2Result);
    await new Promise((r) => setTimeout(r, 1800));
    await session.screenshot('scratch/screenshots/tokamak_step2_playback.png');
    console.log('Saved: scratch/screenshots/tokamak_step2_playback.png');

    // Switch to step 3 (Confined Fusion Plasma)
    console.log('\nClicking Step 3 to test plasma core tracking...');
    const step3Result = await session.eval(`
      (() => {
        const step3Btn = Array.from(document.querySelectorAll("button")).find(b => 
          b.getAttribute("aria-label")?.toLowerCase().includes("plasma") ||
          b.innerText.toLowerCase().includes("plasma")
        );
        if (step3Btn) {
          step3Btn.click();
          return "clicked step 3: " + (step3Btn.getAttribute("aria-label") || step3Btn.innerText);
        }
        return "step 3 button not found";
      })()
    `);
    console.log('Step 3 action:', step3Result);
    await new Promise((r) => setTimeout(r, 1800));
    await session.screenshot('scratch/screenshots/tokamak_step3_playback.png');
    console.log('Saved: scratch/screenshots/tokamak_step3_playback.png');

    console.log('\n--- 2. Testing Ocean Currents Circulation Voiceover Playback ---');
    await session.navigate('http://localhost:3000/studio?q=Why+do+ocean+currents+circulate');
    await new Promise((r) => setTimeout(r, 4500));

    // Click play on Ocean currents
    await session.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const playBtn = buttons.find(b => 
          b.innerText.toLowerCase().includes("play") || 
          b.getAttribute("aria-label")?.toLowerCase().includes("play")
        );
        if (playBtn) playBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1800));
    await session.screenshot('scratch/screenshots/ocean_step1_playback.png');
    console.log('Saved: scratch/screenshots/ocean_step1_playback.png');

    console.log('\nAll visual voiceover browser tests completed successfully!');
  } catch (err) {
    console.error('Browser test failed:', err);
  } finally {
    await session.close();
  }
}

runVisualVoiceoverTest();
