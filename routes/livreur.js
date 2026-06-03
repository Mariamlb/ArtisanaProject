const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Créer table si elle n'existe pas
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS localisation_livreur (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_commande INT NOT NULL,
      lat DECIMAL(10,7) NOT NULL,
      lng DECIMAL(10,7) NOT NULL,
      statut VARCHAR(50) DEFAULT 'en_livraison',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_commande (id_commande)
    ) ENGINE=InnoDB
  `);
}
ensureTable();

// POST /api/livreur/position — le livreur met à jour sa position
// Appelé depuis la page livreur (pas besoin de JWT, juste un code de commande)
router.post("/position", async (req, res) => {
  try {
    const { reference, lat, lng, statut } = req.body;
    if (!reference || !lat || !lng) {
      return res.status(400).json({ message: "reference, lat, lng requis" });
    }

    // Trouver la commande par référence
    const [cmdRows] = await db.query(
      "SELECT id, statut FROM commandes WHERE reference = ?", [reference]
    );
    if (cmdRows.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée" });
    }

    const id_commande = cmdRows[0].id;

    // Upsert localisation
    await db.query(
      `INSERT INTO localisation_livreur (id_commande, lat, lng, statut)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), statut = VALUES(statut), updated_at = NOW()`,
      [id_commande, lat, lng, statut || "en_livraison"]
    );

    // Mettre à jour statut commande si fourni
    if (statut) {
      const statutDB = statut.toUpperCase().replace(/ /g, "_");
      await db.query("UPDATE commandes SET statut = ? WHERE id = ?", [statutDB, id_commande]);
      // Mise à jour livraison
      await db.query("UPDATE livraisons SET statut = ? WHERE id_commande = ?", [statutDB, id_commande]);
    }

    res.json({ message: "Position mise à jour", id_commande });
  } catch (err) {
    console.error("POST /livreur/position error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/livreur/position/:reference — le client récupère la position
router.get("/position/:reference", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ll.lat, ll.lng, ll.statut, ll.updated_at, c.statut AS cmd_statut
       FROM localisation_livreur ll
       JOIN commandes c ON ll.id_commande = c.id
       WHERE c.reference = ?`,
      [req.params.reference]
    );

    if (rows.length === 0) {
      return res.json({ lat: null, lng: null, statut: null });
    }

    res.json({
      lat: parseFloat(rows[0].lat),
      lng: parseFloat(rows[0].lng),
      statut: rows[0].statut,
      updated_at: rows[0].updated_at,
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/livreur/commandes — liste commandes en livraison (pour le livreur)
router.get("/commandes", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.reference, c.statut, c.adresse_livraison,
              u.nom, u.prenom, u.telephone,
              c.total_ttc
       FROM commandes c
       JOIN utilisateurs u ON c.id_client = u.id
       WHERE c.statut IN ('EXPEDIEE', 'EN_LIVRAISON', 'CONFIRMEE', 'EN_PREPARATION')
       ORDER BY c.date_creation DESC`
    );

    res.json(rows.map(r => {
      let adresse = {};
      try { adresse = r.adresse_livraison ? JSON.parse(r.adresse_livraison) : {}; } catch {}
      return {
        id: r.id,
        reference: r.reference,
        statut: r.statut ? r.statut.toLowerCase() : "",
        adresse,
        client: `${r.prenom} ${r.nom}`,
        telephone: r.telephone,
        total: parseFloat(r.total_ttc || 0),
      };
    }));
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
