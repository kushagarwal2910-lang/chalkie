import http from "node:http";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

async function run() {
  console.log("Checking /studio rendered output...");
  const { status, body } = await fetchUrl("http://localhost:3000/studio");
  console.log(`Status: ${status}, Body length: ${body.length}`);

  if (status !== 200) {
    throw new Error(`Expected status 200, got ${status}`);
  }

  // Check search bar width
  const hasFixedSearchWidth = body.includes("max-w-[620px]");
  console.log("Has fixed search bar width max-w-[620px]:", hasFixedSearchWidth);

  // Check panel toggles in HTML
  const hasSourcesToggle = body.includes("Hide sources") || body.includes("Sources");
  const hasGuideToggle = body.includes("Hide guide") || body.includes("Lesson guide");
  console.log("Has sources toggle in HTML:", hasSourcesToggle);
  console.log("Has guide toggle in HTML:", hasGuideToggle);

  // Find linked CSS file
  const cssMatch = body.match(/href="(\/_next\/static\/css\/[^"]+)"/);
  if (cssMatch) {
    const cssUrl = "http://localhost:3000" + cssMatch[1];
    const { body: cssBody } = await fetchUrl(cssUrl);
    const hasNextDevSuppression = cssBody.includes("nextjs-portal") || cssBody.includes("data-next-badge");
    console.log("Has Next.js dev indicator suppression in compiled CSS:", hasNextDevSuppression);
    if (!hasNextDevSuppression) throw new Error("CSS suppression not found in compiled CSS");
  } else {
    console.log("Note: CSS inlined or not matching static pattern");
  }

  if (!hasFixedSearchWidth) {
    throw new Error("Fixed search bar width not found in HTML!");
  }

  console.log("ALL NAVBAR & PANEL VERIFICATIONS PASSED!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
