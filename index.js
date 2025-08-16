import express from "express";
const app = express();

app.get("/hello", (req, res) => {
  res.json({ message: "hello from dokploy", at: new Date().toISOString() });
});

// optional health check (handy for deploys)
app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`listening on :${PORT}`));
