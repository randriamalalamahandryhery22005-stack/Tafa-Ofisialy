TAFAß V8 — PUBLICATION FIX

Correction principale:
- Suppression du SELECT profiles avant INSERT dans posts.
- La publication utilise directement la session Supabase authentifiée.
- posts.user_id = auth.uid().
- Aucun changement à la structure de posts, Auth ou friendships.

Database déjà vérifiée:
- posts.user_id -> profiles.id
- posts INSERT RLS: user_id = auth.uid()
- profiles SELECT policy doit être autorisée pour les fonctions de recherche/profil.

Déploiement:
1. Déployer tout le contenu de ce dossier.
2. Ne pas modifier supabase.sql si la base existe déjà.
3. Tester une publication texte avec visibilité Public.


V9: consulter README_V9.txt et exécuter MEDIA_STORAGE_V9.sql pour Photo/Vidéo/Reel.
