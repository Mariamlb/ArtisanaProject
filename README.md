# 🎨 Artisana — Backend API (Node.js + Express + MySQL)

Backend complet pour le marketplace artisanal marocain **Artisana**.

---

## 📁 Structure du projet

```
ArtBackEndF/
├── config/
│   └── db.js              # Connexion MySQL (pool)
├── middleware/
│   └── auth.js            # Middleware JWT
├── routes/
│   ├── auth.js            # POST /api/auth/login | /register
│   ├── produits.js        # GET/POST /api/produits + /api/seed
│   ├── paniers.js         # GET/POST/DELETE /api/paniers
│   ├── commandes.js       # GET/POST /api/commandes
│   ├── messages.js        # GET/POST /api/messages
│   ├── avis.js            # GET/POST /api/avis
│   └── favoris.js         # GET/POST/DELETE /api/favoris
├── uploads/               # Dossier pour les images uploadées
├── .env                   # Configuration (à éditer)
├── server.js              # Point d'entrée principal
├── package.json
└── README.md
```

---

## ⚙️ Installation & Configuration

### 1. Prérequis
- **Node.js** v18 ou supérieur
- **MySQL** avec **phpMyAdmin**

### 2. Base de données
1. Ouvrez **phpMyAdmin** (`http://localhost/phpmyadmin`)
2. Créez une nouvelle base de données : `marketplace_artisans`
3. Importez le fichier SQL fourni (`database.sql`) via l'onglet **Importer**

### 3. Configuration `.env`
Éditez le fichier `.env` à la racine du backend :
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=           # Votre mot de passe MySQL (vide si WAMP/XAMPP par défaut)
DB_NAME=marketplace_artisans

JWT_SECRET=artisana_secret_jwt_2024_marocain
JWT_EXPIRE=7d

PORT=5000
FRONTEND_URL=http://localhost:5173
```

### 4. Installation des dépendances
```bash
cd ArtBackEndF
npm install
```

### 5. Démarrage
```bash
npm start
```
Le serveur démarre sur **http://localhost:5000**

---

## 🚀 Démarrage complet (Frontend + Backend)

### Terminal 1 — Backend
```bash
cd ArtBackEndF
npm start
```

### Terminal 2 — Frontend
```bash
cd ArtFrontEndF
npm install
npm run dev
```

Ouvrez **http://localhost:5173** dans votre navigateur.

---

## 📡 Endpoints API

### Authentification
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/auth/register` | Inscription client |
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/logout` | Déconnexion |

### Produits
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/produits` | Liste produits (filtres: search, city, category, maxPrice) |
| GET | `/api/produits/:id` | Détail produit |
| POST | `/api/seed` | Seed données démo |

### Panier
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/paniers/:idClient` | Panier du client |
| POST | `/api/paniers` | Ajouter au panier |
| PUT | `/api/paniers/:id` | Modifier quantité |
| DELETE | `/api/paniers/:id` | Supprimer article |

### Commandes
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/commandes` | Créer commande |
| GET | `/api/commandes/mes-commandes` | Mes commandes |
| GET | `/api/commandes/:id` | Détail commande |
| GET | `/api/commandes/:id/tracking` | Suivi commande |

### Messages
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/messages` | Envoyer message |
| GET | `/api/messages/conversation/:id1/:id2` | Conversation |
| GET | `/api/messages/mes-conversations` | Liste conversations |

### Avis
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/avis/produit/:produitId` | Avis d'un produit |
| POST | `/api/avis` | Ajouter avis |

### Favoris
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/favoris/:idClient` | Mes favoris |
| POST | `/api/favoris` | Ajouter favori |
| POST | `/api/favoris/toggle` | Toggle favori |
| DELETE | `/api/favoris/:id` | Supprimer favori |

### Health
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/health` | Statut API |

---

## 🔐 Authentification JWT

Toutes les routes protégées nécessitent un header :
```
Authorization: Bearer <votre_token_jwt>
```

Le token est automatiquement géré par le frontend après connexion.

---

## 🌱 Données de démonstration

Au premier chargement de la page d'accueil, le frontend appelle automatiquement `POST /api/seed` pour créer :
- 6 catégories (Poterie, Tissage, Bijoux, Maroquinerie, Bois sculpté, Zellige)
- 6 artisans avec leurs comptes utilisateurs
- 8 produits approuvés avec images

**Comptes artisans créés :**
- fatima@artisana.ma / artisan123
- hassan@artisana.ma / artisan123
- (etc.)

---

## 🛠 Stack technique

- **Runtime** : Node.js
- **Framework** : Express.js
- **Base de données** : MySQL (via mysql2/promise)
- **Auth** : JWT (jsonwebtoken) + bcryptjs
- **CORS** : cors
- **Config** : dotenv
