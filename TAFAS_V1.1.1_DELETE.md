# Tafaß V1.1.1 — Supprimer sa publication

- Vérifie la session Supabase.
- Autorise la suppression uniquement du post de l'utilisateur connecté.
- Supprime le média du bucket `posts` quand `media_url` permet d'en retrouver le chemin.
- Supprime ensuite la ligne `posts`.
- Rafraîchit le feed quand une fonction de chargement existante est disponible.
- SQL/schema non modifié.

Pour afficher le bouton de suppression dans le renderer du feed, le bouton doit utiliser:
`data-action="delete-post"` et `data-post-id="<POST_ID>"`.
