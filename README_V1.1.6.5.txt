TAFAß V1.1.6.5 — NOTIFICATIONS FINAL SCHEMA COMPAT

Cette version est compatible avec le schema EXISTANT de public.notifications :
id, user_id, actor_id, type, post_id, message, is_read, created_at, comment_id.

Important : recipient_id n'est PAS utilisé.
user_id = destinataire ; actor_id = auteur de l'action.

La persistance des notifications utilise directement Supabase.
Le changement de compte utilise l'utilisateur Supabase Auth courant.
Le bouton Tout lire et Effacer synchronisent aussi Supabase.
Le Realtime des notifications est filtré sur user_id=auth.uid().

SQL : NOTIFICATIONS_V1.1.6.5_SCHEMA_COMPAT.sql
Le SQL est fourni pour référence/installation ; si le correctif RLS précédent a déjà été exécuté avec succès, il n'est pas nécessaire de le rejouer.
