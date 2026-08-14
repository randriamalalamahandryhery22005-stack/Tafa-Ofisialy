# Tafaß — Administration réelle Supabase V1

## Installation

1. Ouvrir **Supabase → SQL Editor**.
2. Exécuter **`ADMIN_REAL_V1.sql`** une seule fois.
3. Vérifier que le compte officiel Tafaß utilise l'adresse Auth confirmée :
   `tafabofisialy@gmail.com`
4. Se connecter avec ce compte dans Tafaß.
5. À la première session, Tafaß appelle `tafa_bootstrap_official_admin()` puis vérifie `tafa_is_admin()` côté serveur.
6. Ouvrir **Menu → Administration**.

## Sécurité

Le navigateur ne décide plus du rôle Admin. La source de vérité est `tafa_admin_roles` dans Supabase.

Les actions sensibles passent par des fonctions `SECURITY DEFINER` :
- suppression utilisateur
- suppression publication
- suppression commentaire
- suppression Page
- suppression Groupe
- changement de statut de compte
- traitement des signalements

Les messages privés ne sont pas exposés dans le dashboard Admin : seul leur volume est compté.

## Important

`ADMIN_REAL_V1.sql` est additionnel. Il ne remplace pas les migrations Realtime existantes et ne demande aucune modification manuelle des tables Realtime.
