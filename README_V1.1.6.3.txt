TAFAß V1.1.6.3 — AMIS / FRIEND REQUESTS PERMISSION FIX

Problème corrigé:
« Impossible d'envoyer l'invitation : permission denied for table friend_requests. »

Cause:
La RLS policy peut être correcte mais le rôle Supabase `authenticated` doit aussi avoir les privilèges SQL SELECT/INSERT/UPDATE/DELETE sur la table.

Action obligatoire:
Exécuter `FRIENDS_RLS_FIX_V1.1.6.3.sql` dans Supabase SQL Editor une seule fois.

Frontend:
L'envoi d'invitation récupère maintenant l'identité depuis `SB.auth.getUser()` afin que `sender_id` soit toujours le vrai `auth.uid()`.
