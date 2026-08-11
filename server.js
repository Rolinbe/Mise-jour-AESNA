const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
    host: 'localhost',
    user: 'rolin',
    password: 'root',
    database: 'aesna',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `photo_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ['.jpg', '.jpeg', '.png', '.pdf'].includes(path.extname(file.originalname).toLowerCase());
        if (!ok) return cb(new Error('Format non autorisé (JPG, PNG, PDF uniquement).'));
        cb(null, true);
    },
});

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'form.html'));
});

app.post('/submit', upload.single('photo'), async (req, res) => {
    const { ce1, ce2, adresse, adresse_exacte, tel1, tel2, etablissement1, etablissement2, mention, niveau } = req.body;
    const errors = [];

    if (!ce1 && !ce2) errors.push("Au moins l'un des deux numéros (N° CE 1 ou N° CE 2) est obligatoire.");
    if (!adresse) errors.push("Le champ Adresse est obligatoire.");
    if (!adresse_exacte) errors.push("Le champ Adresse exacte est obligatoire.");
    if (!tel1 && !tel2) errors.push("Au moins l'un des deux numéros de téléphone est obligatoire.");
    if (!mention) errors.push("Le champ Mention est obligatoire.");
    if (!['l1', 'l2', 'l3', 'm1', 'm2'].includes(niveau)) errors.push("Le champ Niveau est obligatoire.");
    if (!etablissement1 && !etablissement2) errors.push("Au moins l'un des deux établissements est obligatoire.");

    let photo = null;
    if (req.file) {
        photo = `uploads/${req.file.filename}`;
    } else if (req.fileValidationError) {
        errors.push(req.fileValidationError);
    }

    if (errors.length === 0) {
        try {
            await pool.query(
                `INSERT INTO etudiants
                 (ce1, ce2, adresse, adresse_exacte, tel1, tel2, etablissement1, etablissement2, mention, niveau, photo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ce1 || null, ce2 || null,
                    adresse, adresse_exacte,
                    tel1 || null, tel2 || null,
                    etablissement1 ? Number(etablissement1) : null,
                    etablissement2 ? Number(etablissement2) : null,
                    mention, niveau, photo,
                ]
            );
            return res.send(resultPage(true, []));
        } catch (err) {
            console.error('Erreur insertion :', err);
            return res.send(resultPage(false, ["Erreur lors de l'enregistrement dans la base de données."]));
        }
    }

    if (req.file && errors.length > 0) {
        fs.unlink(req.file.path, () => {});
    }
    res.send(resultPage(false, errors));
});

app.use(express.static(__dirname));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send(resultPage(false, ['Le fichier dépasse la taille maximale de 5 Mo.']));
        }
        return res.status(400).send(resultPage(false, ["Erreur d'upload : " + err.message]));
    }
    if (err) {
        console.error(err);
        return res.status(400).send(resultPage(false, [err.message]));
    }
    next();
});

function resultPage(success, errors) {
    const alertes = success
        ? `<p class="ok">Les données de l'étudiant ont bien été enregistrées dans la base de données.</p>`
        : errors.map(e => `<p class="err">${escapeHtml(e)}</p>`).join('');
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Résultat de la saisie</title>
<style>
    body { font-family: 'Inter', Arial, sans-serif; background: #f1f3ff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .carte { background: #ffffff; border: 1px solid #c3c6d6; border-radius: 12px; padding: 40px; max-width: 520px; width: 100%; box-shadow: 0 4px 24px rgba(5,26,62,0.08); }
    .titre { color: #003d9b; font-size: 24px; font-weight: 700; margin-top: 0; }
    .ok { color: #1b5e20; background: #e8f5e9; border: 1px solid #a5d6a7; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
    .err { color: #93000a; background: #ffdad6; border: 1px solid #ffb4ab; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; }
    a { color: #003d9b; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="carte">
    <h1 class="titre">${success ? 'Enregistrement réussi' : 'Erreur lors de la saisie'}</h1>
    ${alertes}
    <p><a href="/">&larr; Retour au formulaire</a></p>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
