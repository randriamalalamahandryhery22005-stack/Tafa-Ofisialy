TAFA V1.1.7.3 — RECHERCHE AVANCÉE

Base exacte: V1.1.7.2 Notifications avancées.

Schéma utilisé (confirmé):
profiles:
id, username, full_name, first_name, last_name, avatar_url, cover_url, bio,
location, relationship_status, is_verified, created_at, updated_at, pseudo,
privacy, birth, gender, country, phone_code, phone, email

posts:
id, user_id, content, media_url, media_type, visibility, created_at,
updated_at, shares

marketplace_listings:
id, owner_id, kind, title, price, description, location, image_url,
created_at, updated_at

Recherche ajoutée:
- Personnes: username, full_name, first_name, last_name, pseudo
- Publications: content
- Photos/Vidéos/Reels: filtrage par media_type sur posts
- Marketplace: title, description, location, kind
- Limite 30 résultats par source
- Tri récent pour posts et marketplace
- Normalisation du texte de recherche

Important:
- Aucun SELECT sur des colonnes non présentes dans le schéma fourni.
- Aucun changement SQL.
- Aucun changement de table ou de données.
