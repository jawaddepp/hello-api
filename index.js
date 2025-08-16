const express = require("express");
const app = express();

// one test endpoint
app.get("/hello", (_req, res) => {
  res.json({ message: "hello from dokploy", at: new Date().toISOString() });
});

// health endpoint for dokploy/traefik checks
app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on :${PORT}`);
});
