import { ChromeBrowserSession } from './chrome-session.mjs';

async function testPlay() {
  const session = new ChromeBrowserSession(9336);
  try {
    await session.launch();
    console.log('Navigating to CRISPR lesson...');
    await session.navigate('http://localhost:3000/studio?q=How+does+CRISPR-Cas9+edit+DNA');
    await new Promise((r) => setTimeout(r, 4000));

    // Check voice state and active target
    const statusBefore = await session.eval(`({
      hasAudio: Boolean(document.querySelector("audio")),
      activePill: document.querySelector("[aria-current='step']")?.innerText || "",
      laserPointer: Boolean(document.querySelector(".chalkie-laser-pointer, [data-testid='laser-pointer']")),
    })`);
    console.log('Status before play:', statusBefore);

    // Click the play button in the voice lesson card
    console.log('Clicking Play button...');
    const playClicked = await session.eval(`
      (() => {
        const btn = document.querySelector("button[aria-label*='play' i], button[aria-label*='teach' i], button[title*='Play' i]") ||
                    Array.from(document.querySelectorAll("button")).find(b => b.innerHTML.includes("<svg") && b.closest(".bg-\\\\[#141622\\\\]") || b.innerText.includes("Play"));
        if (btn) {
          btn.click();
          return true;
        }
        // Try clicking step 1
        const step1 = document.querySelector("[data-step-index='0']");
        if (step1) {
          step1.click();
          return "clicked step 1";
        }
        return false;
      })()
    `);
    console.log('Play clicked result:', playClicked);

    // Wait 1.5 seconds and inspect state
    await new Promise((r) => setTimeout(r, 1500));
    const shotPlay = await session.screenshot('scratch/screenshots/playing-step-1.png');
    console.log('Saved playing screenshot:', shotPlay);

    const playState = await session.eval(`({
      speechSynthesizing: window.speechSynthesis?.speaking,
      activeStepElement: document.querySelector(".border-\\\\[#818cf8\\\\], [data-active='true']")?.innerText?.slice(0, 40),
      laserEl: Boolean(document.querySelector(".chalk-laser, [data-chalk-laser]")),
      activeTargetId: document.querySelector("[data-target-active='true']")?.getAttribute("data-shape-id")
    })`);
    console.log('Playing state:', playState);

  } catch (err) {
    console.error('Play test failed:', err);
  } finally {
    await session.close();
  }
}

testPlay();
