const express = require("express");
const mongoose = require("mongoose");

const app = express();

// connect to Mongo using env var
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => {
    console.error("❌ Mongo connection failed:", err.message);
    // don't exit; app can still start while Mongo comes up
  });

// demo endpoints
app.get("/hello", (_req, res) => {
  res.json({ message: "hello from dokploy", at: new Date().toISOString() });
});

// health for the container
app.get("/healthz", (_req, res) => res.send("ok"));

// simple DB check
app.get("/ping-db", async (_req, res) => {
  try {
    // readyState: 0=disconnected,1=connected,2=connecting,3=disconnecting
    const state = mongoose.connection.readyState;
    if (state !== 1) return res.status(503).json({ ok: false, state });
    const pong = await mongoose.connection.db.admin().ping();
    return res.json({ ok: true, state, pong });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`listening on :${PORT}`));
