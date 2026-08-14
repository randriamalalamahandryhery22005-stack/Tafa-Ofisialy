TAFAß V18.2 — REALTIME + DATA FIX

Cette version garde l'interface existante.

Correctifs principaux:
- posts utilise owner_id + text du schéma Tafa existant
- visibilité Public/Amis/Moi uniquement compatible avec la base
- commentaires content
- réactions reaction_type + RPC sécurisé
- notifications via RPC sécurisé
- conversations/messages persistés dans le bon ordre
- Supabase Realtime pour posts, réactions, commentaires, notifications, messages et conversations
- aucun changement de design

IMPORTANT:
1. Le SQL V18.1 doit déjà être en Success.
2. Exécuter UNE SEULE FOIS: REALTIME_V18.2_DATA-FIX.sql
3. Déployer ensuite les fichiers de cette version.
4. Reconnecter le compte puis tester avec deux comptes.
