# Tafaß V1.1.6.10 — Vidéos / Reels

Cette version part directement de V1.1.6.9 — Stories Supabase.

## Corrections / améliorations
- Séparation réelle des contenus `video` et `reel` dans le frontend.
- Le chargement de `public.posts.media_type` conserve désormais `video` au lieu de convertir automatiquement en `reel`.
- Écran Vidéos : affiche uniquement les publications `media_type = video`.
- Écran Reels : affiche uniquement les publications `media_type = reel`.
- Recherche média activée dans les deux écrans.
- Filtres Tout / Suivis / Populaires / Enregistrés conservés.
- Composer : choix distincts Publication / Photo / Vidéo / Reel.
- Upload vidéo jusqu'à 100 Mo via le bucket `posts` déjà utilisé par Tafaß.
- Les publications vidéo utilisent `media_type = video`; les Reels utilisent `media_type = reel`.
- Authentification Supabase et `auth.uid()` conservés.
- Aucun nouveau schéma SQL requis : cette étape réutilise `public.posts` et le Storage `posts` existants.

## Important
Ne pas exécuter de migration qui convertit toutes les lignes `media_type = video` en `reel` si vous voulez conserver la séparation Vidéos / Reels.
