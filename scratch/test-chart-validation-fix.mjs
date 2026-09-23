// Test chart validation resilience against undefined/missing values
console.log("=== Testing Custom Chart Validation Fix ===");

const problematicPayloads = [
  // 1. Exactly the user's error case: data.0.value is undefined
  { id: "c1", shapeType: "custom-chart", label: "Planetary Masses", props: { data: [{ name: "Earth" }] } },
  // 2. data with alternative keys like label, val, category
  { id: "c2", shapeType: "custom-chart", label: "Atmosphere Pressure", props: { data: [{ label: "Venus", val: "92 bar" }, { category: "Mars", amount: 0.006 }] } },
  // 3. data with string values
  { id: "c3", shapeType: "custom-chart", label: "Orbital Speed", props: { data: [{ name: "Mercury", value: "47.4" }, { name: "Earth", value: "29.8" }] } },
  // 4. empty data or missing data
  { id: "c4", shapeType: "custom-chart", label: "Empty Chart", props: {} },
  // 5. invalid chartType
  { id: "c5", shapeType: "custom-chart", label: "Invalid Type", props: { chartType: "exploded-donut", data: [{ x: "A", y: 10 }] } },
];

function sanitizeChartProps(rawProps, object) {
  let rawData = rawProps.data;
  if (typeof rawData === "string") {
    try { rawData = JSON.parse(rawData); } catch { rawData = []; }
  }
  if (!rawData && object.parts?.[0]?.data) {
    try { rawData = JSON.parse(object.parts[0].data); } catch { /* ignore */ }
  }

  const dataArray = Array.isArray(rawData) ? rawData : [];
  const sanitizedData = dataArray.map((item, idx) => {
    if (typeof item === "number") {
      return { name: `Item ${idx + 1}`, value: Number.isFinite(item) ? item : (idx + 1) * 10 };
    }
    if (typeof item === "string") {
      const parsed = parseFloat(item.replace(/[^0-9.-]/g, ""));
      return { name: `Item ${idx + 1}`, value: Number.isFinite(parsed) ? parsed : (idx + 1) * 10 };
    }
    const name = String(item?.name ?? item?.label ?? item?.category ?? item?.x ?? item?.title ?? item?.key ?? `Item ${idx + 1}`);
    const rawVal = item?.value ?? item?.val ?? item?.y ?? item?.amount ?? item?.count ?? item?.score ?? item?.number ?? item?.v;
    const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal ?? "").replace(/[^0-9.-]/g, ""));
    const value = Number.isFinite(num) ? num : (idx + 1) * 10;
    return {
      name: name || `Item ${idx + 1}`,
      value,
      color: item?.color ? String(item.color) : undefined,
    };
  });

  const finalData = sanitizedData.length > 0 ? sanitizedData : [
    { name: "Group A", value: 45 },
    { name: "Group B", value: 85 },
    { name: "Group C", value: 60 },
  ];

  const validChartTypes = ["bar", "line", "pie", "area"];
  const chartType = validChartTypes.includes(rawProps.chartType) ? rawProps.chartType : "bar";

  return {
    w: Math.max(200, object.width || rawProps.w || 440),
    h: Math.max(160, object.height || rawProps.h || 280),
    title: rawProps.title || object.label || "Statistical Chart",
    chartType,
    data: finalData,
    xAxisLabel: rawProps.xAxisLabel || "",
    yAxisLabel: rawProps.yAxisLabel || "",
    color: rawProps.color || object.color || "blue",
  };
}

for (const payload of problematicPayloads) {
  const result = sanitizeChartProps(payload.props, payload);
  console.log(`\nTesting payload [${payload.id}]:`);
  console.log(`  title: "${result.title}", chartType: "${result.chartType}"`);
  console.log(`  data length: ${result.data.length}`);
  for (const item of result.data) {
    if (typeof item.value !== "number" || !Number.isFinite(item.value)) {
      throw new Error(`FAILED: item.value is not a finite number! Got: ${item.value}`);
    }
    if (typeof item.name !== "string" || !item.name) {
      throw new Error(`FAILED: item.name is not a non-empty string! Got: ${item.name}`);
    }
    console.log(`    - name="${item.name}", value=${item.value}`);
  }
}

console.log("\n=======================================================");
console.log("ALL PROBLEMATIC CHART PAYLOADS SANITIZED SUCCESSFULLY!");
console.log("=======================================================");
