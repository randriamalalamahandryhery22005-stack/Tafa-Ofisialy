TAFAß V8 — PUBLICATION CORRIGÉE

Cette version corrige le formulaire de publication et les messages de statut.

- Le toast utilise maintenant la classe CSS .show et est visible.
- Le formulaire de publication utilise un submit explicite.
- La session Supabase réelle est vérifiée au moment de publier.
- Le profil public correspondant à auth.uid() est vérifié avant INSERT.
- L'INSERT utilise exactement les colonnes réelles de public.posts:
  id, user_id, content, media_url, media_type, visibility.
- L'id de la publication est généré une seule fois avant INSERT.
- La réussite de l'INSERT ne dépend plus d'un SELECT RLS immédiatement après.
- Le rafraîchissement du fil est best-effort après publication.
- Les fichiers index.html, app.js, style.css et supabase-config.js restent dans le même dossier.

IMPORTANT:
Aucun SQL supplémentaire n'est requis pour tester une publication texte Public.
