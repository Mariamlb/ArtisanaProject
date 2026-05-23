const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authMiddleware } = require("../middleware/auth");

// Créer la table favoris si elle n'existe pas (table non incluse dans le SQL initial)
async function ensureFavorisTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS favoris (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_client INT NOT NULL,
        id_produit INT NOT NULL,
        date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_favori (id_client, id_produit),
        FOREIGN KEY (id_client) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        FOREIGN KEY (id_produit) REFERENCES produits(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } catch (err) {
    // Table existe déjà
  }
}
ensureFavorisTable();

// GET /api/favoris/:idClient
router.get("/:idClient", authMiddleware, async (req, res) => {
  try {
    const idClient = parseInt(req.params.idClient);
    if (req.user.id !== idClient && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const [rows] = await db.query(
      `SELECT f.id, p.id AS id_produit, p.nom, p.prix, p.images, p.description,
              a.boutique_nom AS artisan, a.region AS ville, a.note_moyenne AS rating
       FROM favoris f
       JOIN produits p ON f.id_produit = p.id
       JOIN artisans a ON p.id_artisan = a.id
       WHERE f.id_client = ? AND p.actif = TRUE`,
      [idClient]
    );

    res.json(rows.map(r => {
      let images = [];
      try { images = r.images ? JSON.parse(r.images) : []; } catch {}
      return {
        id: r.id,
        id_produit: r.id_produit,
        nom: r.nom,
        prix: parseFloat(r.prix),
        image: images[0] || null,
        artisan: r.artisan,
        ville: r.ville,
        rating: parseFloat(r.rating || 0),
      };
    }));
  } catch (err) {
    console.error("GET /favoris error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// POST /api/favoris - Ajouter favori
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { id_client, id_produit } = req.body;

    if (!id_produit) {
      return res.status(400).json({ message: "id_produit requis" });
    }

    const clientId = id_client || req.user.id;

    const [result] = await db.query(
      "INSERT IGNORE INTO favoris (id_client, id_produit) VALUES (?, ?)",
      [clientId, id_produit]
    );

    res.status(201).json({ message: "Ajouté aux favoris", id: result.insertId });
  } catch (err) {
    console.error("POST /favoris error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// DELETE /api/favoris/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id_client FROM favoris WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Favori non trouvé" });

    if (rows[0].id_client !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    await db.query("DELETE FROM favoris WHERE id = ?", [req.params.id]);
    res.json({ message: "Supprimé des favoris" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// POST /api/favoris/toggle
router.post("/toggle", authMiddleware, async (req, res) => {
  try {
    const { id_client, id_produit } = req.body;
    const clientId = id_client || req.user.id;

    const [existing] = await db.query(
      "SELECT id FROM favoris WHERE id_client = ? AND id_produit = ?",
      [clientId, id_produit]
    );

    if (existing.length > 0) {
      await db.query("DELETE FROM favoris WHERE id = ?", [existing[0].id]);
      return res.json({ action: "removed", message: "Retiré des favoris" });
    }

    const [result] = await db.query(
      "INSERT INTO favoris (id_client, id_produit) VALUES (?, ?)",
      [clientId, id_produit]
    );
    res.json({ action: "added", message: "Ajouté aux favoris", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
