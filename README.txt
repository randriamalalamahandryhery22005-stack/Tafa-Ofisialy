TAFAß — ÉTAPE 4
Publications réelles connectées à Supabase.

Cette version ajoute :
- Publications texte dans public.posts
- Photos/vidéos dans Supabase Storage (bucket posts)
- Feed chargé depuis Supabase
- Réactions réelles dans post_reactions
- Commentaires réels dans comments
- Modification/suppression des publications du propriétaire
- Compteurs de partages enregistrés dans Supabase

Installation :
1. Ouvrir Supabase > SQL Editor.
2. Exécuter le fichier supabase.sql complet.
3. Vérifier que les buckets profiles et posts existent.
4. Déployer le dossier sur Vercel ou lancer avec un serveur local.
5. Se connecter, publier un texte, puis tester une photo/vidéo, réaction et commentaire.

Important : les fonctionnalités Pages, Stories, Marketplace, Messages et autres modules restent traitées dans les étapes suivantes.


FIX INSCRIPTION
- Le bouton « Créer un nouveau compte » possède maintenant un fallback indépendant.
- Il ouvre directement l'étape 1/5 même si une autre partie du JavaScript rencontre une erreur.


FIX v5: inscription UI made independent from app.js; Supabase config guarded.


TAFAß V3 — PROFIL + RECHERCHE
- Chargement des profils depuis Supabase après connexion.
- Ouverture d'un profil par ID avec rafraîchissement Supabase.
- Bouton ami dynamique: Ajouter / Invitation envoyée / Accepter / Amis.
- Aucun changement requis dans Auth, profiles, friendships ou friend_requests.
