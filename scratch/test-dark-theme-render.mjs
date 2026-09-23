async function testRender() {
  const [studioRes, homeRes] = await Promise.all([
    fetch("http://localhost:3000/studio"),
    fetch("http://localhost:3000")
  ]);

  const studioHtml = await studioRes.text();
  const homeHtml = await homeRes.text();

  console.log("=== STUDIO PAGE CHECK ===");
  console.log("HTTP Status:", studioRes.status);
  console.log("Contains 'class=\"dark\"':", studioHtml.includes('class="dark"'));
  console.log("Contains themeColor '#090a0f':", studioHtml.includes('#090a0f'));

  console.log("\n=== HOME PAGE CHECK ===");
  console.log("HTTP Status:", homeRes.status);
  console.log("Contains 'class=\"dark\"':", homeHtml.includes('class="dark"'));
  console.log("Contains themeColor '#090a0f':", homeHtml.includes('#090a0f'));

  if (studioRes.status === 200 && homeRes.status === 200 && studioHtml.includes('class="dark"') && homeHtml.includes('class="dark"')) {
    console.log("\n>>> ALL DARK THEME SERVER CHECKS PASSED 100%! <<<");
  } else {
    console.error(">>> FAILED SOME CHECKS <<<");
    process.exit(1);
  }
}

testRender().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
