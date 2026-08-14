TAFAß V1.1.6.7 — PROFIL SUPABASE

Base: V1.1.6.6 Recherche Supabase.

Profil:
- Profil personnel et profils des autres utilisateurs depuis public.profiles.
- Edition des informations personnelles et confidentialité.
- Photo de profil et couverture via Supabase Storage bucket profiles.
- Synchronisation du profil avec la session Supabase Auth.
- Publications, photos, Reels, amis et informations du profil.
- Actions d'amitié selon friendships(requester_id, receiver_id, status).
- Rafraîchissement explicite du profil depuis Supabase.
- Aucun mécanisme d'authentification local n'est utilisé.

Aucun nouveau SQL n'est requis si le schéma profiles/storage existant est déjà installé.
