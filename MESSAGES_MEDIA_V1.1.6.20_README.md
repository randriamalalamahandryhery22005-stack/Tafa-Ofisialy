# TAFAß V1.1.6.20 — Messages Media

## Pourquoi cette version
Le module Messages utilisait `storage.from('messages')`, mais le projet ne contenait pas de création/policies fiables pour le bucket `messages`. Le texte pouvait donc fonctionner alors que tous les uploads échouaient.

## Installation Supabase
1. Ouvrir Supabase → SQL Editor.
2. Exécuter `MESSAGES_MEDIA_STORAGE_V1.sql` une seule fois.
3. Vérifier Storage → Buckets → `messages`.
4. Le bucket doit être `Public` et avoir une limite de 100 Mo.

## Formats testés
- Images : JPG, JPEG, PNG, GIF, WEBP
- Vidéos : MP4, WEBM, MOV, M4V
- Audio : MP3, WAV, OGG, M4A
- Documents : PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, JSON
- Archives : ZIP, RAR
- APK

## Flow
Choisir fichier → upload Storage `messages` → URL publique → insertion dans `messages.media_url` → affichage dans la conversation.

Les messages texte existants ne sont pas modifiés.
