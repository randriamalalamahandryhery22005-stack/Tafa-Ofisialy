TAFAß V1.1.5.4 — FIX COMMENTS / REPLIES

Correction majeure:
La base Supabase existante impose comments.text NOT NULL.
Le frontend envoie maintenant BOTH text et content lors de la création et de la modification des commentaires/réponses.

Dans Supabase SQL Editor:
1. Exécuter COMMENTS_V1.1.5.sql
2. Vérifier le message: TAFA V1.1.5.4 — text + content COMPATIBILITY OK
3. Recharger l'application.

Cette version conserve les réponses imbriquées, les likes, les notifications et le Realtime.
