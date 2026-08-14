TAFAß V1.1.6.9 — STORIES

Source: V1.1.6.8 — ACTUALITES

1) Exécuter STORIES_V1.1.6.9_SUPABASE.sql une seule fois dans Supabase SQL Editor.
2) Recharger l'application.
3) Tester: créer Story texte, image, vidéo; visibilité Public/Amis; vue; réaction; réponse; suppression.
4) Les Stories expirent après 24 heures et le compte connecté est toujours déterminé par Supabase Auth.

Schéma créé:
- public.stories
- public.story_views
- public.story_reactions
- public.story_replies
- Storage bucket: stories

Le module utilise le schéma friendships existant: requester_id, receiver_id, status.
