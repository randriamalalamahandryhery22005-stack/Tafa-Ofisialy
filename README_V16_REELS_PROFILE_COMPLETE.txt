TAFAß V16 — REELS + PROFIL COMPLET

1. Tous les anciens posts avec media_type='video' sont convertis en media_type='reel' via REELS_PROFILE_COMPLETE_V16.sql.
2. Tout nouveau fichier vidéo publié est enregistré comme Reel.
3. Le profil affiche Publications, Photos, Reels, Amis et À propos.
4. L'édition du profil contient maintenant les informations déjà prévues par la base : prénom, nom, date de naissance, genre, username, pays, code téléphone, téléphone, e-mail, pseudo, bio, localisation, situation amoureuse, photo de profil et couverture.
5. Les informations sont enregistrées dans public.profiles via Supabase.
6. La logique Auth, Storage, réactions, commentaires, partages et Supabase existante est conservée.
7. Aucune modification du mécanisme Realtime n'est introduite par cette version.

IMPORTANT : exécuter une seule fois REELS_PROFILE_COMPLETE_V16.sql dans Supabase SQL Editor pour convertir les anciennes vidéos déjà en base.
