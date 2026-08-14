TAFAß V9 — PHOTO / VIDÉO / REEL + STORAGE

Cette version part de la V8 qui publie déjà correctement les publications texte.

NOUVEAUTÉS
- Photo: upload image vers Storage bucket `posts`.
- Vidéo: upload vidéo vers Storage bucket `posts`.
- Reel: upload vidéo vers Storage et affichage vidéo vertical.
- Prévisualisation du fichier avant publication.
- Limites côté navigateur: image 15 Mo, vidéo 100 Mo.
- Nettoyage automatique du fichier Storage si l'insertion dans `posts` échoue.
- Les médias sont liés à `posts.media_url` et `posts.media_type`.

IMPORTANT — SUPABASE
Si la base actuelle fonctionne déjà:
1. Ouvrir Supabase > SQL Editor.
2. Exécuter UNIQUEMENT `MEDIA_STORAGE_V9.sql`.
3. Le résultat final doit afficher le bucket `posts` avec `public = true`.
4. Ne pas remplacer les policies `posts` déjà fonctionnelles.
5. Tester d'abord une Photo, puis une Vidéo, puis un Reel.

POLICIES STORAGE
Les fichiers sont stockés sous:
  posts/<ID_UTILISATEUR>/<UUID>.<extension>

Un utilisateur authentifié ne peut écrire/modifier/supprimer que dans son propre dossier.
La lecture est publique car le bucket `posts` est public et l'app utilise `getPublicUrl()`.

FICHIERS MODIFIÉS
- app.js
- style.css
- supabase.sql
- MEDIA_STORAGE_V9.sql
- README_V9.txt

Déploiement:
Déployer tout le dossier `Tafa-Ofisialy-main/` sur Vercel comme pour la V8.
