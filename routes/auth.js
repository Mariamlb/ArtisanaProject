const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "artisana_secret";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { nom, prenom, email, motDePasse, telephone, ville } = req.body;

    if (!nom || !prenom || !email || !motDePasse) {
      return res.status(400).json({ message: "Champs obligatoires manquants" });
    }

    // Vérifier si email existe déjà
    const [existing] = await db.query("SELECT id FROM utilisateurs WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }

    const hashedPwd = await bcrypt.hash(motDePasse, 12);

    const [result] = await db.query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, telephone, actif, email_verifie)
       VALUES (?, ?, ?, ?, 'CLIENT', ?, TRUE, FALSE)`,
      [nom, prenom, email, hashedPwd, telephone || null]
    );

    const userId = result.insertId;

    const token = jwt.sign(
      { id: userId, email, role: "CLIENT", nom, prenom },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    res.status(201).json({
      token,
      id: userId,
      nom,
      prenom,
      email,
      role: "CLIENT",
      telephone: telephone || null,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Erreur serveur lors de l'inscription" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const [rows] = await db.query(
      "SELECT * FROM utilisateurs WHERE email = ? AND actif = TRUE",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(motDePasse, user.mot_de_passe);
    if (!valid) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    // Sauvegarder le refresh token
    await db.query("UPDATE utilisateurs SET refresh_token = ? WHERE id = ?", [token, user.id]);

    res.json({
      token,
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      telephone: user.telephone,
      photo: user.photo,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Erreur serveur lors de la connexion" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await db.query("UPDATE utilisateurs SET refresh_token = NULL WHERE id = ?", [decoded.id]);
      } catch {}
    }
    res.json({ message: "Déconnexion réussie" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
