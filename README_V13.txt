TAFAß V13
=========
Correction principale:
- Le schéma Supabase live utilise `post_reactions.reaction_type`.
- V12 frontend cherchait encore `post_reactions.reaction`, ce qui provoquait:
  "Could not find the 'reaction' column of 'post_reactions' in the schema cache".
- V13 lit maintenant `reaction_type`.

Interactions:
- 7 réactions: J'aime, J'adore, Solidaire, Haha, Waouh, Triste, En colère.
- RPC existante `tafa_set_post_reaction` conservée.
- Commentaires lus depuis `comments.content`.
- Partages lus depuis `posts.shares`.
- RPC existante `tafa_increment_post_share` conservée.
- Refresh après réaction/commentaire/partage recharge les données Supabase.

IMPORTANT:
- Aucun nouveau SQL de modification n'est requis si les fonctions/RLS actuels sont déjà ceux du projet.
- `INTERACTIONS_V13.sql` est uniquement un diagnostic non-destructif.
