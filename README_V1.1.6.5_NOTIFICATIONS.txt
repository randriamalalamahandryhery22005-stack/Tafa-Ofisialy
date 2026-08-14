TAFAß V1.1.6.5 — NOTIFICATIONS

Correction principale:
- notifications utilise recipient_id, pas user_id.
- entity_type/entity_id remplace post_id/comment_id.
- création via tafa_create_notification(uuid,text,text,text,text,uuid).
- lecture, marquage lu et suppression protégés par recipient_id = auth.uid().
- realtime notifications conservé.

Après installation du ZIP, exécuter une seule fois:
NOTIFICATIONS_V1.1.6.5_SUPABASE.sql

Tests:
1. Compte A envoie une invitation à B.
2. B doit recevoir la notification.
3. B accepte: A reçoit la notification d'acceptation.
4. Cliquer une notification de publication/commentaire doit ouvrir le contenu concerné.
5. Tout lire / Effacer ne doit agir que sur le compte connecté.
6. Changer de compte: aucune notification du compte précédent ne doit apparaître.
