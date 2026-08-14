TAFAß V5 - PUBLICATION BACKEND CORRIGÉ

Correction principale : le frontend utilisait des colonnes posts qui n'existent pas dans la base réelle.
Structure réelle utilisée :
- id
- user_id
- content
- media_url
- media_type
- visibility
- created_at
- updated_at

La création de publication utilise désormais ces colonnes.
La lecture mappe user_id/content/updated_at vers le modèle frontend.
La modification utilise content/visibility/updated_at et user_id.
La visibilité est stockée en DB sous : public / friends / private.
Aucune migration SQL n'est nécessaire pour cette correction.
