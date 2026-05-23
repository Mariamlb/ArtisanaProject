const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authMiddleware } = require("../middleware/auth");

// GET /api/paniers/:idClient
router.get("/:idClient", authMiddleware, async (req, res) => {
  try {
    const idClient = parseInt(req.params.idClient);
    if (req.user.id !== idClient && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const [rows] = await db.query(
      `SELECT pa.id, pa.id_produit, pa.quantite, pa.prix_snapshot, pa.date_ajout,
              p.nom, p.prix, p.images, p.stock,
              a.boutique_nom AS artisan
       FROM paniers pa
       JOIN produits p ON pa.id_produit = p.id
       JOIN artisans a ON p.id_artisan = a.id
       WHERE pa.id_client = ? AND p.actif = TRUE`,
      [idClient]
    );

    const items = rows.map(r => {
      let images = [];
      try { images = r.images ? JSON.parse(r.images) : []; } catch {}
      return {
        id: r.id,
        id_produit: r.id_produit,
        quantite: r.quantite,
        nom: r.nom,
        prix: parseFloat(r.prix_snapshot || r.prix),
        image: images[0] || null,
        artisan: r.artisan,
        stock: r.stock,
      };
    });

    res.json(items);
  } catch (err) {
    console.error("GET /paniers error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// POST /api/paniers - Ajouter au panier
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { id_client, id_produit, quantite = 1 } = req.body;

    if (!id_produit) {
      return res.status(400).json({ message: "id_produit requis" });
    }

    // Vérifier stock produit
    const [prodRows] = await db.query("SELECT prix, stock FROM produits WHERE id = ? AND actif = TRUE", [id_produit]);
    if (prodRows.length === 0) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }
    const produit = prodRows[0];

    const clientId = id_client || req.user.id;

    // Vérifier si déjà dans le panier
    const [existing] = await db.query(
      "SELECT id, quantite FROM paniers WHERE id_client = ? AND id_produit = ?",
      [clientId, id_produit]
    );

    if (existing.length > 0) {
      const newQty = existing[0].quantite + quantite;
      if (newQty > produit.stock) {
        return res.status(400).json({ message: "Stock insuffisant" });
      }
      await db.query("UPDATE paniers SET quantite = ? WHERE id = ?", [newQty, existing[0].id]);
      return res.json({ message: "Quantité mise à jour", id: existing[0].id });
    }

    if (quantite > produit.stock) {
      return res.status(400).json({ message: "Stock insuffisant" });
    }

    const [result] = await db.query(
      "INSERT INTO paniers (id_client, id_produit, quantite, prix_snapshot) VALUES (?, ?, ?, ?)",
      [clientId, id_produit, quantite, produit.prix]
    );

    res.status(201).json({ message: "Ajouté au panier", id: result.insertId });
  } catch (err) {
    console.error("POST /paniers error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// DELETE /api/paniers/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id_client FROM paniers WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Article non trouvé" });

    if (rows[0].id_client !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    await db.query("DELETE FROM paniers WHERE id = ?", [req.params.id]);
    res.json({ message: "Article supprimé du panier" });
  } catch (err) {
    console.error("DELETE /paniers error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// PUT /api/paniers/:id - Modifier quantité
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { quantite } = req.body;
    if (!quantite || quantite < 1) {
      return res.status(400).json({ message: "Quantité invalide" });
    }

    const [rows] = await db.query("SELECT id_client, id_produit FROM paniers WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Article non trouvé" });

    if (rows[0].id_client !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    await db.query("UPDATE paniers SET quantite = ? WHERE id = ?", [quantite, req.params.id]);
    res.json({ message: "Quantité mise à jour" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
