const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://localhost:5175",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const produitsRouter = require("./routes/produits");
app.use("/api/auth",      require("./routes/auth"));
app.use("/api/produits",  produitsRouter);
app.use("/api/paniers",   require("./routes/paniers"));
app.use("/api/commandes", require("./routes/commandes"));
app.use("/api/messages",  require("./routes/messages"));
app.use("/api/avis",      require("./routes/avis"));
app.use("/api/favoris",   require("./routes/favoris"));
app.use("/api/livreur",   require("./routes/livreur"));

// Seed alias
app.post("/api/seed", (req, res, next) => {
  req.url = "/seed";
  produitsRouter(req, res, next);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Artisana API 🎨", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} non trouvée` });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Erreur interne" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Artisana Backend → http://localhost:${PORT}`);
  console.log(`📦 API → http://localhost:${PORT}/api`);
  console.log(`🚚 Livreur → http://localhost:${PORT}/api/livreur\n`);
});

module.exports = app;
