TAFA V1.1.7.7 — NOTIFICATIONS & REALTIME

Base: V1.1.7.6 Marketplace avancé.

Schéma utilisé:
notifications:
id, actor_id, post_id, user_id + colonnes déjà présentes dans l'application.

Ajouts frontend non destructifs:
- Normalisation des notifications.
- Déduplication par id.
- Comptage des notifications non lues.
- Marquage local comme lu.
- Préparation d'un flux realtime unique via window.tafaNotificationsV177.
- UI notification mobile propre.
- Aucun changement SQL/schema.
