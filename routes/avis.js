const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authMiddleware, optionalAuth } = require("../middleware/auth");

// GET /api/avis/produit/:produitId
router.get("/produit/:produitId", optionalAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.note, a.commentaire, a.reponse_artisan, a.date_avis,
              u.nom, u.prenom, u.photo
       FROM avis a
       JOIN utilisateurs u ON a.id_client = u.id
       WHERE a.id_produit = ? AND a.valide = TRUE
       ORDER BY a.date_avis DESC`,
      [req.params.produitId]
    );
    res.json(rows.map(r => ({
      _id: r.id,
      id: r.id,
      note: r.note,
      commentaire: r.commentaire,
      reponse_artisan: r.reponse_artisan,
      createdAt: r.date_avis,
      nom_utilisateur: `${r.prenom} ${r.nom}`,
      photo: r.photo,
    })));
  } catch (err) {
    console.error("GET /avis/produit error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// POST /api/avis
router.post("/", authMiddleware, async (req, res) => {
  try {
    // Support les deux formats: {produitId, note, commentaire} ou {id_produit, note, commentaire}
    const id_produit = req.body.id_produit || req.body.produitId;
    const { note, commentaire, id_commande } = req.body;

    if (!id_produit || !note) {
      return res.status(400).json({ message: "Produit et note requis" });
    }
    if (note < 1 || note > 5) {
      return res.status(400).json({ message: "Note entre 1 et 5" });
    }

    const [prodRows] = await db.query(
      "SELECT id, id_artisan FROM produits WHERE id = ? AND actif = TRUE", [id_produit]
    );
    if (prodRows.length === 0) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    // Pas de doublon
    const [existing] = await db.query(
      "SELECT id FROM avis WHERE id_client = ? AND id_produit = ?",
      [req.user.id, id_produit]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Vous avez déjà laissé un avis pour ce produit" });
    }

    const id_artisan = prodRows[0].id_artisan;

    // Chercher une commande valide si pas fournie
    let cmdId = id_commande;
    if (!cmdId) {
      const [cmdRows] = await db.query(
        `SELECT c.id FROM commandes c 
         JOIN lignes_commande lc ON lc.id_commande = c.id
         WHERE c.id_client = ? AND lc.id_produit = ? LIMIT 1`,
        [req.user.id, id_produit]
      );
      cmdId = cmdRows.length > 0 ? cmdRows[0].id : 1;
    }

    const [result] = await db.query(
      `INSERT INTO avis (id_client, id_artisan, id_produit, id_commande, note, commentaire, valide)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [req.user.id, id_artisan, id_produit, cmdId, note, commentaire || null]
    );

    // Mettre à jour note moyenne artisan
    await db.query(
      `UPDATE artisans SET note_moyenne = (
        SELECT AVG(note) FROM avis WHERE id_artisan = ? AND valide = TRUE
      ) WHERE id = ?`,
      [id_artisan, id_artisan]
    );

    res.status(201).json({
      _id: result.insertId,
      id: result.insertId,
      note,
      commentaire,
      nom_utilisateur: `${req.user.prenom} ${req.user.nom}`,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("POST /avis error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
