const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authMiddleware } = require("../middleware/auth");

// POST /api/messages - Envoyer message
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { id_destinataire, contenu, id_produit, sujet } = req.body;

    if (!id_destinataire || !contenu) {
      return res.status(400).json({ message: "Destinataire et contenu requis" });
    }

    // Vérifier que le destinataire existe
    const [destRows] = await db.query("SELECT id FROM utilisateurs WHERE id = ? AND actif = TRUE", [id_destinataire]);
    if (destRows.length === 0) {
      return res.status(404).json({ message: "Destinataire non trouvé" });
    }

    const [result] = await db.query(
      `INSERT INTO messages (id_expediteur, id_destinataire, id_produit, contenu, sujet, type_message)
       VALUES (?, ?, ?, ?, ?, 'NORMAL')`,
      [req.user.id, id_destinataire, id_produit || null, contenu, sujet || null]
    );

    // Notification destinataire
    await db.query(
      "INSERT INTO notifications (id_utilisateur, type, contenu, reference_id, reference_type) VALUES (?, 'MESSAGE', ?, ?, 'message')",
      [id_destinataire, `Nouveau message de ${req.user.prenom} ${req.user.nom}`, result.insertId]
    );

    res.status(201).json({ message: "Message envoyé", id: result.insertId });
  } catch (err) {
    console.error("POST /messages error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/messages/conversation/:id1/:id2
router.get("/conversation/:id1/:id2", authMiddleware, async (req, res) => {
  try {
    const { id1, id2 } = req.params;

    // Vérifier que l'utilisateur connecté fait partie de la conversation
    if (req.user.id !== parseInt(id1) && req.user.id !== parseInt(id2) && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const [rows] = await db.query(
      `SELECT m.id, m.contenu, m.date_envoi, m.lu, m.sujet, m.id_produit,
              m.id_expediteur, m.id_destinataire,
              u1.nom AS exp_nom, u1.prenom AS exp_prenom, u1.photo AS exp_photo,
              p.nom AS produit_nom
       FROM messages m
       JOIN utilisateurs u1 ON m.id_expediteur = u1.id
       LEFT JOIN produits p ON m.id_produit = p.id
       WHERE (m.id_expediteur = ? AND m.id_destinataire = ?)
          OR (m.id_expediteur = ? AND m.id_destinataire = ?)
       ORDER BY m.date_envoi ASC`,
      [id1, id2, id2, id1]
    );

    // Marquer les messages comme lus
    await db.query(
      "UPDATE messages SET lu = TRUE WHERE id_destinataire = ? AND id_expediteur = ? AND lu = FALSE",
      [req.user.id, id1 === String(req.user.id) ? id2 : id1]
    );

    res.json(rows.map(m => ({
      id: m.id,
      from: m.id_expediteur === parseInt(id1) ? "user" : "artisan",
      text: m.contenu,
      time: m.date_envoi,
      lu: m.lu,
      expediteur: `${m.exp_prenom} ${m.exp_nom}`,
      sujet: m.sujet,
      produit_nom: m.produit_nom,
    })));
  } catch (err) {
    console.error("GET /conversation error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/messages/mes-conversations
router.get("/mes-conversations", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        CASE WHEN m.id_expediteur = ? THEN m.id_destinataire ELSE m.id_expediteur END AS interlocuteur_id,
        u.nom, u.prenom, u.photo,
        MAX(m.date_envoi) AS derniere_date,
        SUM(CASE WHEN m.id_destinataire = ? AND m.lu = FALSE THEN 1 ELSE 0 END) AS non_lus
       FROM messages m
       JOIN utilisateurs u ON u.id = CASE WHEN m.id_expediteur = ? THEN m.id_destinataire ELSE m.id_expediteur END
       WHERE m.id_expediteur = ? OR m.id_destinataire = ?
       GROUP BY interlocuteur_id
       ORDER BY derniere_date DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /mes-conversations error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
