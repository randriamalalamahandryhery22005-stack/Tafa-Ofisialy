TAFA V1.1.7.8 — PROFIL AVANCÉ

Base: V1.1.7.7 Notifications & Realtime.

Schéma profiles utilisé exactement selon le schéma confirmé:
id, username, full_name, first_name, last_name, avatar_url, cover_url,
bio, location, relationship_status, is_verified, created_at, updated_at,
pseudo, privacy, birth, gender, country, phone_code, phone, email.

posts utilisé:
id, user_id, content, media_url, media_type, visibility, created_at,
updated_at, shares.

Ajouts frontend:
- Normalisation du nom d'affichage.
- Onglets Publications / Photos / Vidéos / Reels basés sur posts.user_id.
- Séparation stricte vidéo/reel.
- Affichage cover/avatar responsive.
- Bio et informations longues sans débordement.
- Aucun changement SQL/schema.
