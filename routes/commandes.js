const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { authMiddleware } = require("../middleware/auth");

// Générer une référence unique
function genRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "CMD-";
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// POST /api/commandes - Créer commande
router.post("/", authMiddleware, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items,
      adresse_livraison,
      mode_paiement = "carte",
      note_commande,
      frais_livraison = 50,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Panier vide" });
    }

    // Calculer totaux
    let total_ht = 0;
    const lignes = [];

    for (const item of items) {
      const [prodRows] = await conn.query(
        "SELECT p.id, p.prix, p.stock, p.id_artisan FROM produits p WHERE p.id = ? AND p.actif = TRUE",
        [item.id_produit || item.id]
      );
      if (prodRows.length === 0) throw new Error(`Produit ${item.id_produit || item.id} non trouvé`);

      const prod = prodRows[0];
      if (prod.stock < (item.quantite || 1)) throw new Error(`Stock insuffisant pour le produit ${prod.id}`);

      const sousTotal = prod.prix * (item.quantite || 1);
      total_ht += sousTotal;
      lignes.push({ id_produit: prod.id, id_artisan: prod.id_artisan, quantite: item.quantite || 1, prix_unitaire: prod.prix, sous_total: sousTotal });
    }

    const total_ttc = total_ht + parseFloat(frais_livraison);
    const commission = total_ht * 0.05; // 5% commission
    const reference = genRef();

    // Créer commande
    const [cmdResult] = await conn.query(
      `INSERT INTO commandes (id_client, statut, total_ht, frais_livraison, total_ttc, mode_paiement, adresse_livraison, note_commande, commission, reference)
       VALUES (?, 'EN_ATTENTE', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, total_ht, frais_livraison, total_ttc, mode_paiement, JSON.stringify(adresse_livraison), note_commande, commission, reference]
    );

    const id_commande = cmdResult.insertId;

    // Créer lignes commande + mettre à jour stock
    for (const ligne of lignes) {
      await conn.query(
        `INSERT INTO lignes_commande (id_commande, id_produit, id_artisan, quantite, prix_unitaire, statut_artisan, sous_total)
         VALUES (?, ?, ?, ?, ?, 'EN_ATTENTE', ?)`,
        [id_commande, ligne.id_produit, ligne.id_artisan, ligne.quantite, ligne.prix_unitaire, ligne.sous_total]
      );

      await conn.query(
        "UPDATE produits SET stock = stock - ?, nb_ventes = nb_ventes + ? WHERE id = ?",
        [ligne.quantite, ligne.quantite, ligne.id_produit]
      );
    }

    // Créer enregistrement paiement
    await conn.query(
      "INSERT INTO paiements (id_commande, montant, statut, mode_paiement) VALUES (?, ?, 'EN_ATTENTE', ?)",
      [id_commande, total_ttc, mode_paiement]
    );

    // Créer livraison
    await conn.query(
      "INSERT INTO livraisons (id_commande, mode, statut, adresse, frais) VALUES (?, 'standard', 'EN_ATTENTE', ?, ?)",
      [id_commande, JSON.stringify(adresse_livraison), frais_livraison]
    );

    // Vider le panier du client
    await conn.query("DELETE FROM paniers WHERE id_client = ?", [req.user.id]);

    // Notification client
    await conn.query(
      "INSERT INTO notifications (id_utilisateur, type, contenu, reference_id, reference_type) VALUES (?, 'COMMANDE', ?, ?, 'commande')",
      [req.user.id, `Votre commande ${reference} a été créée avec succès !`, id_commande]
    );

    await conn.commit();

    res.status(201).json({
      message: "Commande créée avec succès",
      id: id_commande,
      reference,
      total_ttc,
    });
  } catch (err) {
    await conn.rollback();
    console.error("POST /commandes error:", err);
    res.status(500).json({ message: err.message || "Erreur serveur" });
  } finally {
    conn.release();
  }
});

// GET /api/commandes/mes-commandes
router.get("/mes-commandes", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.reference, c.statut, c.total_ttc, c.date_creation, c.adresse_livraison,
              c.mode_paiement, c.frais_livraison,
              JSON_ARRAYAGG(JSON_OBJECT(
                'id', lc.id,
                'nom', p.nom,
                'image', p.images,
                'quantite', lc.quantite,
                'prix', lc.prix_unitaire,
                'sous_total', lc.sous_total,
                'statut_artisan', lc.statut_artisan
              )) AS items
       FROM commandes c
       LEFT JOIN lignes_commande lc ON lc.id_commande = c.id
       LEFT JOIN produits p ON lc.id_produit = p.id
       WHERE c.id_client = ?
       GROUP BY c.id
       ORDER BY c.date_creation DESC`,
      [req.user.id]
    );

    const formatted = rows.map(c => {
      let items = [];
      try {
        items = c.items || [];
        items = items.map(i => {
          let images = [];
          try { images = i.image ? JSON.parse(i.image) : []; } catch {}
          return { ...i, image: images[0] || null };
        });
      } catch {}

      let adresse = {};
      try { adresse = c.adresse_livraison ? JSON.parse(c.adresse_livraison) : {}; } catch {}

      return {
        _id: c.id,
        id: c.id,
        code_commande: c.reference,
        statut: c.statut ? c.statut.toLowerCase() : "en_attente",
        total: parseFloat(c.total_ttc || 0),
        createdAt: c.date_creation,
        items,
        adresse_livraison: adresse,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("GET /mes-commandes error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/commandes/:id
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, l.num_suivi, l.transporteur, l.statut AS statut_livraison, l.date_expedition, l.date_livraison
       FROM commandes c
       LEFT JOIN livraisons l ON l.id_commande = c.id
       WHERE c.id = ? AND (c.id_client = ? OR ? = 'ADMIN')`,
      [req.params.id, req.user.id, req.user.role]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Commande non trouvée" });

    const [lignes] = await db.query(
      `SELECT lc.*, p.nom, p.images, a.boutique_nom AS artisan
       FROM lignes_commande lc
       JOIN produits p ON lc.id_produit = p.id
       JOIN artisans a ON lc.id_artisan = a.id
       WHERE lc.id_commande = ?`,
      [req.params.id]
    );

    const cmd = rows[0];
    let adresse = {};
    try { adresse = cmd.adresse_livraison ? JSON.parse(cmd.adresse_livraison) : {}; } catch {}

    res.json({
      ...cmd,
      adresse_livraison: adresse,
      statut: cmd.statut ? cmd.statut.toLowerCase() : "en_attente",
      items: lignes.map(l => {
        let images = [];
        try { images = l.images ? JSON.parse(l.images) : []; } catch {}
        return { ...l, image: images[0] };
      }),
    });
  } catch (err) {
    console.error("GET /commandes/:id error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/commandes/:id/tracking
router.get("/:id/tracking", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.statut, c.reference, c.date_creation,
              l.num_suivi, l.transporteur, l.statut AS statut_livraison,
              l.date_expedition, l.date_livraison
       FROM commandes c
       LEFT JOIN livraisons l ON l.id_commande = c.id
       WHERE c.id = ? AND (c.id_client = ? OR ? = 'ADMIN')`,
      [req.params.id, req.user.id, req.user.role]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Commande non trouvée" });

    const cmd = rows[0];
    const statut = cmd.statut ? cmd.statut.toLowerCase() : "en_attente";

    // Générer historique tracking
    const STEPS = ["en_attente", "confirmee", "en_preparation", "expediee", "en_livraison", "livree"];
    const stepIdx = STEPS.indexOf(statut);

    const tracking = STEPS.slice(0, stepIdx + 1).map((s, i) => ({
      statut: s,
      message: {
        en_attente: "Commande reçue",
        confirmee: "Commande confirmée par l'artisan",
        en_preparation: "Préparation en cours à l'atelier",
        expediee: "Colis remis au transporteur",
        en_livraison: "Livreur en route vers votre adresse",
        livree: "Livré avec succès",
      }[s],
      date: new Date(new Date(cmd.date_creation).getTime() + i * 24 * 3600000),
      localisation: { lat: 33.5731, lng: -7.5898 },
    }));

    res.json({
      statut,
      reference: cmd.reference,
      tracking,
      num_suivi: cmd.num_suivi,
      transporteur: cmd.transporteur,
    });
  } catch (err) {
    console.error("GET /tracking error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
