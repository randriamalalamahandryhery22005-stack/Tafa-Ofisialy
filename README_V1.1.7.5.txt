TAFA V1.1.7.5 — AMIS AVANCÉS

Base: V1.1.7.4 Vidéos/Reels avancés.

Schéma ciblé:
- friend_requests: sender_id, receiver_id
- friendships: requester_id, receiver_id
- blocks: blocker_id, blocked_id

Ajouts frontend non destructifs:
- Calcul du statut: amis, invitation envoyée, invitation reçue, aucun lien.
- Suggestions excluant l'utilisateur courant et les relations déjà connues.
- Helpers pour listes Amis / Invitations / Suggestions.
- CSS mobile pour cartes et actions.
- Aucun changement SQL et aucune modification de données.

Les actions existantes d'acceptation/refus/envoi/annulation restent compatibles
avec les fonctions déjà présentes dans l'application.
