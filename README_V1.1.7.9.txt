TAFA V1.1.7.9 — PAGES & GROUPES AVANCÉS

Base: V1.1.7.8 Profil avancé.

Cette version ajoute une couche frontend non destructive pour:
- séparation Pages / Groupes;
- recherche locale par nom, titre, username, pseudo, description ou bio;
- suppression des doublons par id;
- filtres Tous / Pages / Groupes;
- interface responsive et textes sans débordement.

Important:
Le schéma SQL des Pages/Groupes n'a pas été fourni dans les informations
confirmées précédemment. Cette version NE crée donc aucune requête vers une
table ou colonne Pages/Groupes inventée et ne modifie aucun SQL/schema.

Les données déjà chargées par l'application peuvent être utilisées par les
helpers sans supposer une nouvelle structure Supabase.
