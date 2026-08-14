TAFA V1.1.7.6 — MARKETPLACE AVANCÉ

Base exacte: V1.1.7.5 Amis avancés.

Schéma confirmé:
marketplace_listings:
id, owner_id, kind, title, price, description, location,
image_url, created_at, updated_at

Ajouts frontend non destructifs:
- Normalisation robuste des valeurs de recherche (toujours string).
- Recherche sur title, description, location, kind et price.
- Filtrage Marketplace.
- Détection de l'annonce appartenant à l'utilisateur courant via owner_id.
- Affichage image sans crop forcé, hauteur automatique.
- Helpers pour carte, image et actions Marketplace.
- Aucun changement SQL/schema.
