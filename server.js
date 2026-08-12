const express = require('express');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.png'));
});

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

app.get('/favicon-32.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon-32.png'));
});

app.get('/apple-touch-icon.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'apple-touch-icon.png'));
});

app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'script.js'));
});

app.post('/submit', upload.single('photo'), async (req, res) => {
    const { nom, prenom, ce1, ce2, adresse, adresse_exacte, tel1, tel2, etablissement1, etablissement2, mention, niveau } = req.body;
    const errors = [];

    if (!nom) errors.push("Le champ Nom est obligatoire.");
    if (!prenom) errors.push("Le champ Prénom est obligatoire.");
    if (!ce1 && !ce2) errors.push("Au moins l'un des deux numéros (N° CE 1 ou N° CE 2) est obligatoire.");
    if (!adresse) errors.push("Le champ Adresse est obligatoire.");
    if (!adresse_exacte) errors.push("Le champ Adresse exacte est obligatoire.");
    if (!tel1 && !tel2) errors.push("Au moins l'un des deux numéros de téléphone est obligatoire.");
    if (!mention) errors.push("Le champ Mention est obligatoire.");
    if (!['l1', 'l2', 'l3', 'm1', 'm2'].includes(niveau)) errors.push("Le champ Niveau est obligatoire.");
    if (!etablissement1 && !etablissement2) errors.push("Au moins l'un des deux établissements est obligatoire.");

    let photo = null;
    if (req.file) {
        photo = {
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
        };
    } else if (req.fileValidationError) {
        errors.push(req.fileValidationError);
    }

    if (errors.length === 0) {
        const niveaux = { l1: 'Licence 1', l2: 'Licence 2', l3: 'Licence 3', m1: 'Master 1', m2: 'Master 2' };

        const infos = {
            nom: nom, prenom: prenom, ce1: ce1, ce2: ce2, adresse: adresse, adresse_exacte: adresse_exacte,
            tel1: tel1, tel2: tel2, mention: mention,
            niveau: niveaux[niveau] || niveau,
            etablissement1: etablissement1 || null,
            etablissement2: etablissement2 || null,
            photo: photo,
        };

        try {
            await envoyerNotification(infos);
            console.log('E-mail de notification envoyé.');
            return res.send(resultPage(true, []));
        } catch (err) {
            console.error('Échec de l\'envoi de l\'e-mail :', err.message);
            return res.send(resultPage(false, ["L'inscription a bien été reçue mais l'e-mail de notification n'a pas pu être envoyé. Contactez l'administrateur."]));
        }
    }

    res.send(resultPage(false, errors));
});

app.use(express.static(__dirname));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send(resultPage(false, ['Le fichier dépasse la taille maximale de 4 Mo.']));
        }
        return res.status(400).send(resultPage(false, ["Erreur d'upload : " + err.message]));
    }
    if (err) {
        console.error(err);
        return res.status(400).send(resultPage(false, [err.message]));
    }
    next();
});

async function envoyerNotification(infos) {
    const LOGO_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCweRBD9zxU-sH0HyQHIdWJ6-HON5zNJBAT2maJnd_eC8WyZaDTXqMK1erEU43_viYMzJhugNXJVB9uRCSk7uWDQpxUDiDptRUyayQFgV9RWPHoTuOy_deFTidDeuK_EjvG8-AMoAPdASqPCDkovdYFb1uY1PoW82AvqSiwnLsSemgdEN3YI0FozWepvEhzdXkOsv8Tce2LBhB66wgTzx7rz0b5XoDw__RrKoJWIgLsbkn-J6uCNQdCacTtUZ_2XFYNrA';

    const carte = (titre, lignes) => `
        <div style="background:#faf9ff;border:1px solid #e1e8ff;border-radius:12px;margin-bottom:16px;padding:16px 20px;">
            <div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#003d9b;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e1e8ff;">${titre}</div>
            ${lignes}
        </div>`;

    const item = (label, valeur) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;">
            <span style="color:#434654;">${label}</span>
            <span style="color:#051a3e;font-weight:600;text-align:right;padding-left:12px;">${valeur}</span>
        </div>`;

    const secu = v => escapeHtml(v || '—');
    const attachments = [];

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#e9edff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9edff;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d8e2ff;box-shadow:0 8px 24px rgba(5,26,62,0.08);">
                    <tr>
                        <td style="background:#003d9b;padding:28px 24px;text-align:center;">
                            <img src="${LOGO_URL}" alt="AESNA" width="90" style="display:block;margin:0 auto 12px;border-radius:12px;">
                            <div style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">Nouvelle inscription</div>
                            <div style="font-size:13px;color:#c4d2ff;margin-top:4px;">Association des Étudiants</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px;">
                            <p style="font-size:14px;color:#051a3e;margin:0 0 20px;">Bonjour,<br>Une nouvelle inscription a été enregistrée dans le formulaire AESNA&nbsp;:</p>

                            ${carte('Identification',
                                item('Nom', secu(infos.nom)) +
                                item('Prénom', secu(infos.prenom)) +
                                item('N° CE 1', secu(infos.ce1)) +
                                item('N° CE 2', secu(infos.ce2)))}

                            ${carte('Coordonnées',
                                item('Adresse', secu(infos.adresse)) +
                                item('Adresse exacte', secu(infos.adresse_exacte)) +
                                item('Téléphone 1', secu(infos.tel1)) +
                                item('Téléphone 2', secu(infos.tel2)))}

                            ${carte('Établissement',
                                item('Établissement 1', secu(infos.etablissement1)) +
                                item('Établissement 2', secu(infos.etablissement2)))}

                            ${carte('Académique',
                                item('Mention', secu(infos.mention)) +
                                item('Niveau', secu(infos.niveau)))}

                            <div style="background:#faf9ff;border:1px solid #e1e8ff;border-radius:12px;padding:16px 20px;">
                                <div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#003d9b;margin-bottom:10px;">Photo de profil</div>
                                ${blocPhoto(infos, attachments)}
                            </div>

                            <p style="font-size:12px;color:#737685;text-align:center;margin:20px 0 0;">Inscription reçue le ${new Date().toLocaleString('fr-FR')}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#e9edff;padding:14px 24px;text-align:center;font-size:12px;color:#434654;">
                            AESNA — Ho ela velogna AESNA
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: process.env.MAIL_TO,
        subject: `Nouvelle inscription AESNA — ${infos.nom} ${infos.prenom}`.trim(),
        text: 'Une nouvelle inscription a été enregistrée. Ouvrez cet e-mail au format HTML pour voir les détails et la photo.',
        html: html,
        attachments: attachments,
    });
}

function blocPhoto(infos, attachments) {
    if (!infos.photo) return '<p style="font-size:14px;color:#737685;margin:0;">Aucune photo fournie.</p>';

    const ext = path.extname(infos.photo.originalname).toLowerCase();
    const nom = path.basename(infos.photo.originalname);

    attachments.push({ filename: nom, content: infos.photo.buffer });

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        attachments[attachments.length - 1].cid = 'photo@aesna';
        return '<img src="cid:photo@aesna" alt="Photo de profil" width="200" style="display:block;max-width:220px;border-radius:12px;border:1px solid #d8e2ff;margin:0 auto;">';
    }
    return '<p style="font-size:14px;color:#737685;margin:0;">Photo au format PDF : disponible en pièce jointe ci-dessous.</p>';
}

function resultPage(success, errors) {
    const alertes = success
        ? `<p class="ok">L'inscription a bien été reçue. Un e-mail de notification a été envoyé.</p>`
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

module.exports = app;

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
    });
}
