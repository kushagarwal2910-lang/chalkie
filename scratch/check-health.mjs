const res = await fetch("http://localhost:3000/api/health");
const text = await res.text();
console.log("Health response:", res.status, text);
