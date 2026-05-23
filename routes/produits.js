const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { optionalAuth } = require("../middleware/auth");

// GET /api/produits - Liste des produits avec filtres
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { search, city, category, maxPrice, minPrice, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT 
        p.id, p.nom, p.description, p.prix, p.stock, p.statut,
        p.images, p.delai_fabrication, p.date_ajout, p.nb_vues, p.nb_ventes, p.slug,
        a.boutique_nom, a.specialite, a.region AS ville, a.verifie AS verified,
        a.note_moyenne, a.photo_profil,
        c.nom AS categorie,
        u.nom AS artisan_nom, u.prenom AS artisan_prenom,
        COALESCE(AVG(av.note), 0) AS rating,
        COUNT(DISTINCT av.id) AS nb_avis
      FROM produits p
      JOIN artisans a ON p.id_artisan = a.id
      JOIN utilisateurs u ON a.id_utilisateur = u.id
      JOIN categories c ON p.id_categorie = c.id
      LEFT JOIN avis av ON av.id_produit = p.id AND av.valide = TRUE
      WHERE p.actif = TRUE AND p.statut = 'APPROUVE'
    `;
    const params = [];

    if (search) {
      query += ` AND (p.nom LIKE ? OR a.boutique_nom LIKE ? OR c.nom LIKE ? OR p.description LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (city) {
      query += ` AND a.region LIKE ?`;
      params.push(`%${city}%`);
    }
    if (category) {
      query += ` AND c.nom LIKE ?`;
      params.push(`%${category}%`);
    }
    if (maxPrice) {
      query += ` AND p.prix <= ?`;
      params.push(Number(maxPrice));
    }
    if (minPrice) {
      query += ` AND p.prix >= ?`;
      params.push(Number(minPrice));
    }

    query += ` GROUP BY p.id ORDER BY p.date_ajout DESC`;

    const [rows] = await db.query(query, params);

    // Formater pour le frontend
    const formatted = rows.map(p => {
      let images = [];
      try { images = p.images ? JSON.parse(p.images) : []; } catch { images = []; }
      return {
        id: p.id,
        nom: p.nom,
        description: p.description,
        prix: parseFloat(p.prix),
        ancienPrix: null,
        image: images[0] || `https://images.unsplash.com/photo-1585664811087-47f65abbad64?w=400&q=80`,
        images: images,
        boutique_nom: p.boutique_nom,
        artisan: p.boutique_nom,
        categorie: p.categorie,
        category: p.categorie,
        ville: p.ville || "Maroc",
        city: p.ville || "Maroc",
        verified: Boolean(p.verified),
        note_moyenne: parseFloat(p.rating || 0).toFixed(1),
        rating: parseFloat(p.rating || 0),
        nb_avis: p.nb_avis,
        stock: p.stock,
        delai_fabrication: p.delai_fabrication,
        slug: p.slug,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("GET /produits error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// GET /api/produits/:id
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        p.*, a.boutique_nom, a.region AS ville, a.verifie AS verified,
        a.note_moyenne, a.photo_profil, a.description AS artisan_bio,
        c.nom AS categorie,
        u.nom AS artisan_nom, u.prenom AS artisan_prenom,
        COALESCE(AVG(av.note), 0) AS rating,
        COUNT(DISTINCT av.id) AS nb_avis
       FROM produits p
       JOIN artisans a ON p.id_artisan = a.id
       JOIN utilisateurs u ON a.id_utilisateur = u.id
       JOIN categories c ON p.id_categorie = c.id
       LEFT JOIN avis av ON av.id_produit = p.id AND av.valide = TRUE
       WHERE p.id = ? AND p.actif = TRUE
       GROUP BY p.id`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Produit non trouvé" });

    const p = rows[0];
    let images = [];
    try { images = p.images ? JSON.parse(p.images) : []; } catch {}

    // Incrémenter nb_vues
    await db.query("UPDATE produits SET nb_vues = nb_vues + 1 WHERE id = ?", [p.id]);

    res.json({
      id: p.id,
      nom: p.nom,
      description: p.description,
      prix: parseFloat(p.prix),
      image: images[0] || null,
      images,
      boutique_nom: p.boutique_nom,
      artisan: p.boutique_nom,
      categorie: p.categorie,
      ville: p.ville,
      city: p.ville,
      verified: Boolean(p.verified),
      rating: parseFloat(p.rating || 0),
      nb_avis: p.nb_avis,
      stock: p.stock,
      delai_fabrication: p.delai_fabrication,
      artisan_bio: p.artisan_bio,
    });
  } catch (err) {
    console.error("GET /produits/:id error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// POST /api/seed - Seed données de démonstration
router.post("/seed", async (req, res) => {
  try {
    // Vérifier si des produits existent déjà
    const [existing] = await db.query("SELECT COUNT(*) as cnt FROM produits");
    if (existing[0].cnt > 0) {
      return res.json({ message: "Données déjà présentes", seeded: false });
    }

    // Seed catégories
    const categories = [
      ["Poterie", "poterie", "Poterie et céramique marocaine", "🏺"],
      ["Tissage", "tissage", "Tapis et tissages berbères", "🧶"],
      ["Bijoux", "bijoux", "Bijoux artisanaux", "💎"],
      ["Maroquinerie", "maroquinerie", "Cuir et maroquinerie", "👜"],
      ["Bois sculpté", "bois-sculpte", "Artisanat du bois", "🪵"],
      ["Zellige", "zellige", "Carreaux de zellige", "🔷"],
    ];

    for (const [nom, slug, desc, icone] of categories) {
      await db.query(
        "INSERT IGNORE INTO categories (nom, slug, description, icone) VALUES (?, ?, ?, ?)",
        [nom, slug, desc, icone]
      );
    }

    // Seed artisans utilisateurs
    const bcrypt = require("bcryptjs");
    const pwd = await bcrypt.hash("artisan123", 10);
    const artisansData = [
      ["Benali", "Fatima", "fatima@artisana.ma", "Fès"],
      ["Ouchikh", "Hassan", "hassan@artisana.ma", "Marrakech"],
      ["Ifergan", "Khadija", "khadija@artisana.ma", "Agadir"],
      ["Ziani", "Mohammed", "mohammed@artisana.ma", "Fès"],
      ["Semlali", "Youssef", "youssef@artisana.ma", "Rabat"],
      ["Bensouda", "Aicha", "aicha@artisana.ma", "Casablanca"],
    ];

    const artisanIds = [];
    for (const [nom, prenom, email, region] of artisansData) {
      const [existU] = await db.query("SELECT id FROM utilisateurs WHERE email = ?", [email]);
      let userId;
      if (existU.length > 0) {
        userId = existU[0].id;
      } else {
        const [r] = await db.query(
          "INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, actif) VALUES (?, ?, ?, ?, 'ARTISAN', TRUE)",
          [nom, prenom, email, pwd]
        );
        userId = r.insertId;
      }

      const boutique = `${prenom} ${nom}`;
      const [existA] = await db.query("SELECT id FROM artisans WHERE id_utilisateur = ?", [userId]);
      let artisanId;
      if (existA.length > 0) {
        artisanId = existA[0].id;
      } else {
        const [r2] = await db.query(
          "INSERT INTO artisans (id_utilisateur, boutique_nom, region, verifie, note_moyenne) VALUES (?, ?, ?, TRUE, ?)",
          [userId, boutique, region, (Math.random() * 2 + 3).toFixed(1)]
        );
        artisanId = r2.insertId;
      }
      artisanIds.push(artisanId);
    }

    // Seed produits
    const produits = [
      { nom: "Tajine en Poterie de Fès", desc: "Tajine authentique fabriqué à la main à Fès, idéal pour la cuisson traditionnelle.", prix: 380, cat: 1, artisan: 0, images: '["https://images.unsplash.com/photo-1585664811087-47f65abbad64?w=800"]' },
      { nom: "Tapis Berbère Tissé Main", desc: "Magnifique tapis berbère tissé à la main avec des motifs géométriques traditionnels.", prix: 1200, cat: 2, artisan: 1, images: '["https://images.unsplash.com/photo-1600369671236-e74521d4b6ad?w=800"]' },
      { nom: "Bracelet Argent Amazigh", desc: "Bracelet en argent massif orné de motifs amazighs ciselés à la main.", prix: 290, cat: 3, artisan: 2, images: '["https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800"]' },
      { nom: "Sac Cuir Maroquin", desc: "Sac en cuir véritable tanné naturellement à Fès, couture main traditionnelle.", prix: 650, cat: 4, artisan: 3, images: '["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800"]' },
      { nom: "Vase Zellige Polychrome", desc: "Vase décoratif en zellige fait main, aux couleurs vibrantes et motifs géométriques.", prix: 450, cat: 6, artisan: 0, images: '["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800"]' },
      { nom: "Plateau Bois d'Argan Sculpté", desc: "Plateau sculpté dans le bois d'argan, motifs floraux traditionnels.", prix: 320, cat: 5, artisan: 4, images: '["https://images.unsplash.com/photo-1567696911980-2eed69a46042?w=800"]' },
      { nom: "Caftan Brodé Fassi", desc: "Caftan traditionnel brodé à la main par des artisanes de Fès.", prix: 1800, cat: 2, artisan: 5, images: '["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"]' },
      { nom: "Théière Argent Gravée", desc: "Théière en métal argenté avec gravures florales traditionnelles.", prix: 520, cat: 3, artisan: 2, images: '["https://images.unsplash.com/photo-1567621793993-3e2e0e5e7be3?w=800"]' },
    ];

    for (const p of produits) {
      const slug = p.nom.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now() + Math.random().toString(36).substr(2, 4);
      await db.query(
        `INSERT INTO produits (id_artisan, id_categorie, nom, description, prix, stock, statut, images, actif, slug)
         VALUES (?, ?, ?, ?, ?, ?, 'APPROUVE', ?, TRUE, ?)`,
        [artisanIds[p.artisan] || artisanIds[0], p.cat, p.nom, p.desc, p.prix, Math.floor(Math.random() * 20 + 5), p.images, slug]
      );
    }

    res.json({ message: "Données de démonstration créées avec succès", seeded: true });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ message: "Erreur seed: " + err.message });
  }
});

module.exports = router;
