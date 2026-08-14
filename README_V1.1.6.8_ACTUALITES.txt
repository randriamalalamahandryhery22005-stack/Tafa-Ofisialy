TAFAß V1.1.6.8 — ACTUALITÉS

Base: V1.1.6.7 Profil Supabase.

Actualités reliées aux données Supabase existantes :
- chargement des publications depuis public.posts ;
- création de publication via user_id/content/media_url/media_type/visibility ;
- réactions via tafa_set_post_reaction ;
- commentaires via public.comments ;
- partage via tafa_increment_post_share ;
- suppression protégée par RLS ;
- visibilité Public / Amis / Moi uniquement ;
- rafraîchissement manuel et Realtime ;
- filtres Tout, Amis, Mes publications, Photos, Vidéos.

Aucun nouveau SQL requis pour cette étape si les fonctions/RLS des publications déjà validées sont présentes.
