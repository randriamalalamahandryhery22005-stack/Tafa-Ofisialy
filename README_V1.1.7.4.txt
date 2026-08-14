TAFA V1.1.7.4 — VIDEOS / REELS AVANCÉS

Base: V1.1.7.3 Recherche avancée.

Schema utilisé:
posts.media_url
posts.media_type

Règle stricte:
- media_type contenant "reel" => Reels
- media_type video/mp4/webm/mov ou contenant "video" => Vidéos
- media_type image/photo => Photos

Ajouts frontend:
- Helper de séparation stricte Vidéos/Reels.
- Player HTML5 avec controls, playsinline et fullscreen natif.
- object-fit: contain pour éviter le crop des vidéos.
- largeur responsive avec hauteur automatique pour préserver le ratio original.
- Préchargement metadata seulement.
- Limitation raisonnable de hauteur sur mobile/desktop.
- Aucun changement SQL.
