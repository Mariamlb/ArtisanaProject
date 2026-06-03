const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "marketplace_artisans",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00",
});

// Test connection
pool.getConnection()
  .then(conn => {
    console.log("✅ Connexion MySQL réussie !");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Erreur connexion MySQL :", err.message);
    console.error("👉 Vérifiez vos paramètres dans le fichier .env");
  });

module.exports = pool;
