TAFAß V18.6 — DELETE + PREMIUM MENU
===================================

Nouveautés frontend
-------------------
- Suppression définitive du compte depuis Profil > ... > Supprimer définitivement mon compte.
- Suppression définitive des Pages dont l'utilisateur est propriétaire.
- Suppression des Groupes dont l'utilisateur est propriétaire (fonction existante conservée).
- Suppression d'un message depuis Options du message.
- Suppression d'une conversation complète depuis Options de la conversation.
- Menu réorganisé en sections avec textes et descriptions plus clairs.
- Libellés : Enregistrer, Événement, Badge Bleu · 5 étapes, Aide, Conditions, À propos de Tafaß.
- Interface responsive et premium, sans modification des fichiers Realtime existants.

IMPORTANT SUPABASE
------------------
Exécuter une seule fois : ACCOUNT_DELETE_V1.sql

Ce fichier ajoute uniquement les fonctions RPC :
- tafa_delete_message(uuid)
- tafa_delete_conversation(uuid)
- tafa_delete_my_account()

Il ne remplace pas les migrations Realtime existantes.
Sans ACCOUNT_DELETE_V1.sql, l'interface affiche une erreur contrôlée au lieu de prétendre que la suppression a réussi.
