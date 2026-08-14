TAFAß V1.1.4 — GESTION DES COMMENTAIRES

Cette version continue directement Tafa-b-ofisialy-main.

Fonctionnalités:
- Ajouter un commentaire
- Modifier son propre commentaire
- Supprimer son propre commentaire
- J'aime / unlike persistant sur les commentaires
- Notification automatique au propriétaire de la publication
- Actualisation Realtime des commentaires et likes
- RLS Supabase
- Interface responsive
- Pas de réponses imbriquées dans V1.1.4

À FAIRE DANS SUPABASE:
1. Ouvrir SQL Editor.
2. Exécuter COMMENTS_V1.1.4.sql.
3. Vérifier le résultat "TAFA V1.1.4 — commentaires OK".
4. Recharger l'application.

IMPORTANT:
Le schéma canonique des commentaires utilise maintenant la colonne `text`.
La version frontend V1.1.4 n'utilise plus `content` pour créer/modifier un commentaire.
