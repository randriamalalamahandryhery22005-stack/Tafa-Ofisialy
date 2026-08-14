TAFAß — V8 PUBLICATION CORRIGÉE

Cette version utilise la structure réelle de la table public.posts:
id, user_id, content, media_url, media_type, visibility, created_at, updated_at.

Correction principale:
- l'INSERT d'une publication n'utilise plus .select().single() immédiatement après l'INSERT.
  Cela évite qu'une SELECT policy bloque la publication juste après un INSERT autorisé.
- les erreurs Supabase/RLS sont affichées plus clairement.
- upload photo/vidéo utilise le bucket posts.
- le projet contient index.html, app.js, style.css et supabase-config.js dans le même dossier.

IMPORTANT:
- Aucun nouveau SQL n'est nécessaire pour tester une publication PUBLIC si la policy posts_insert autorise
  user_id = auth.uid() et si le bucket n'est pas nécessaire pour un texte.
- Ne lance pas les anciennes migrations contenant owner_id, allowed_users ou title/text.
- Le fichier POSTS_DB_DIAGNOSTIC.sql est en lecture seule si tu veux vérifier la base.

TEST:
1. Remplacer l'ancien dossier par ce dossier.
2. Se connecter.
3. Actualités > Publier.
4. Choisir Public.
5. Publier un texte simple, sans photo.
6. Si ça échoue, le message affiché contient maintenant l'erreur Supabase utile.

Ensuite seulement, tester photo/vidéo.
