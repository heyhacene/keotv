# Directives Fondamentales KeoTV

## 1. Référence Absolue UI & Ergonomie : TiviMate
TiviMate est la référence officielle et exclusive pour toute l'architecture de navigation télécommande (D-Pad Android TV), la disposition de l'interface et l'expérience utilisateur de KeoTV.

## 2. TV en Direct & Guide EPG : Timeline Horizontale Inline
- **Bandeau Supérieur d'Information (Hero Panel)** :
  - Affiche dynamiquement les informations du programme sélectionné : nom et logo de la chaîne, titre du programme, plage horaire, durée, jauge de progression en temps réel, genre et synopsis complet.
- **Ligne de Chaîne avec Ruban Temporel Continu** :
  - Chaque rangée de chaîne est une timeline horizontale de cartes de programmes :
    - Programmes passés (marqués du symbole Replay ↺ si éligibles)
    - Programme en cours (mis en valeur, badge direct, jauge d'avancement)
    - Programmes futurs (programmations suivantes)
- **Navigation D-Pad Télécommande** :
  - **Haut / Bas** : bascule d'une chaîne à l'autre.
  - **Droite** : avance de case en case dans les programmes futurs de la chaîne (met à jour le bandeau supérieur).
  - **Gauche** : recule de case en case dans les programmes passés (met à jour le bandeau supérieur).
  - **Extrême Gauche** : donne le focus à la chaîne / ouvre la barre latérale des bouquets.
- **Actions Touche OK** :
  - Clic OK sur le programme **En cours** : lance la chaîne en direct plein écran.
  - Clic OK sur un programme **Passé (Replay)** : démarre immédiatement la lecture du Replay / Timeshift pour ce créneau sans ouvrir de popup ou menu intermédiaire.
  - Clic OK sur un programme **Futur** : affiche les détails étendus du programme.

## 3. Catalogue VOD & Séries
- Grille de 7 vignettes par ligne avec réduction de la barre latérale.
- Bandeau supérieur dynamique affichant les détails du film/série sélectionné (backdrop, titre, durée, note, casting, synopsis).
- Défilement continu : à la 7ème vignette d'une rangée, DPAD Droite passe au début de la rangée suivante.

## 4. Règles de Lecture & Préférences
- Lors du visionnage d'un Replay, les touches Haut / Bas / Chaine +/- / Swipes verticaux ne changent pas de chaîne.
- Mémorisation permanente de la langue audio et des sous-titres : pour chaque film en VOD, et pour l'intégralité des épisodes d'une même série.
