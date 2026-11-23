# Ma Cave — remplir une fiche en parlant (conception)

Date : 2026-11-22. Version visée : 0.5.0.

## Intention

Le père de l'utilisatrice (60 ans, peu à l'aise avec le numérique) doit pouvoir décrire une bouteille **en parlant naturellement**
(« un Château Talbot 2016, Saint-Julien, j'en ai six, offert par Paul, à boire avant 2030 »). L'IA range chaque information
dans la bonne case de la fiche ; il n'a plus qu'à **vérifier puis enregistrer**. C'est une troisième façon de remplir une fiche,
à côté de la photo d'étiquette et de la saisie à la main.

## Objectifs

- Un gros bouton « Parler » dans la fiche ; un second geste « J'ai fini » ; la fiche se remplit.
- Plus de champs que la photo : nom, couleur, millésime, « à boire jusqu'en », appellation, région, cépage, nombre de
  bouteilles, prix, note, commentaires.
- Il voit ce que l'app a compris (« J'ai compris : … ») et peut le corriger.

## Non-objectifs

- **Pas de lieu à la voix** : la place se choisit toujours en touchant l'étagère, comme aujourd'hui (décision de l'utilisatrice).
- Pas de conversation, pas de commandes vocales pour d'autres actions (retirer, déplacer…).
- Pas de fonctionnement hors ligne (Gemini a besoin d'internet, comme pour la photo).

## Anti-objectifs (ce qui serait un échec même si « ça marche »)

- **Enregistrer sans qu'il ait vérifié** : la voix ne fait que pré-remplir, jamais d'enregistrement automatique.
- **Écraser ce qu'il a tapé à la main.**
- **Inventer** des informations qu'il n'a pas dites (sauf les déductions sûres prévues ci-dessous, toujours visibles et modifiables).

## Contraintes

- Même service et même clé que la lecture d'étiquette (Gemini, clé dans le `localStorage` de l'appareil, `scan.js`). Sans clé, le
  bouton n'apparaît pas et une astuce renvoie aux réglages, comme pour la photo.
- Ce qu'il dit (sa voix, ou le texte) est **envoyé à Google** ; avec l'offre gratuite, Google peut réutiliser ces contenus. Les
  réglages et le bouton le disent.
- iPhone, app installée sur l'écran d'accueil, iOS 15 et plus ; interface en français, gros boutons ; tout texte venu de l'IA passe
  par `esc()` avant d'entrer dans du HTML.
- Logique pure (requête, validation de la réponse, fusion dans le formulaire) dans `scan.js` / `lib.js`, avec tests.

## Approches envisagées

1. **Bouton « Parler » : enregistrement audio dans l'app, envoyé à Gemini** (texte compris + champs en un appel). Le plus naturel
   pour lui. Coûts : l'iPhone demande l'accès au micro (sans doute à chaque ouverture de l'app installée), et c'est la voix qui part
   chez Google ; le format audio de l'iPhone doit être accepté par Gemini.
2. **Dictée du clavier de l'iPhone** dans un grand champ texte, puis envoi du texte à Gemini. Très fiable, pas de permission, seul du
   texte part ; mais il faut trouver le micro du clavier (deux gestes).
3. Reconnaissance vocale de Safari (Web Speech) : écartée, peu fiable dans une app installée sur l'écran d'accueil.

**Choix de l'utilisatrice : 1, avec 2 en secours.** Le texte compris s'affiche dans un champ modifiable ; il peut le corriger (ou le
dicter avec le clavier) et relancer « Remplir la fiche ».

## Ce que voit l'utilisateur

Photo et voix sont **deux boutons séparés** (validé avec l'utilisatrice) : il choisit l'un, l'autre, ou les deux (photo pour le nom et
l'année, puis voix pour « j'en ai six, offert par Paul »). Ils partagent seulement le réglage (même clé Google). En haut de la fiche
(nouvelle fiche, ajout dans une case, modification) :

```
Remplir automatiquement
┌───────────────────┐ ┌───────────────────┐
│       📷          │ │       🎤          │
│  Photo de         │ │     Parler        │
│  l'étiquette      │ │                   │
└───────────────────┘ └───────────────────┘
Ce que vous photographiez ou dites est envoyé à Google.

Nom / Domaine / Château  [                ]
…
```

- 📷 : comme aujourd'hui (photo, lecture automatique de l'étiquette) ; la photo s'affiche dessous avec « Changer » et « Retirer ».
- 🎤 : voir ci-dessous ; la zone « J'ai compris » apparaît sous les deux boutons.
- Sans clé : 📷 prend seulement la photo (comme aujourd'hui) et 🎤 n'apparaît pas ; l'astuce actuelle renvoie aux réglages.

Pendant l'enregistrement : le bouton devient rouge « ■ J'ai fini (0:12) » ; arrêt automatique à 60 s.
Pendant l'envoi : « Je remplis la fiche… ». Ensuite :

```
J'ai compris :
┌──────────────────────────────────────────────┐
│ Château Talbot 2016, Saint-Julien, j'en ai   │  ← texte modifiable
│ six, offert par Paul, à boire avant 2030     │
└──────────────────────────────────────────────┘
[ Remplir la fiche ]   [ 🎤 Reparler ]
✓ Fiche remplie : vérifiez les champs avant d'enregistrer.
```

Les champs remplis par la voix sont brièvement mis en évidence (même style que les autres aides).
Si le micro n'est pas disponible (refusé, ou pas d'enregistrement possible sur cet appareil), le champ texte apparaît directement,
avec : « Touchez le champ puis le micro du clavier pour dicter, ou écrivez. »

## Comportement

- **Remplissage** (décidé avec l'utilisatrice) : ce que la voix donne **remplace** la valeur d'un champ, y compris une valeur déjà
  enregistrée quand on modifie une fiche (« note 17 » remplace 15) : le dire est une intention claire, les champs changés sont mis
  en évidence et rien n'est enregistré sans « Enregistrer ». **Exception : un champ tapé à la main dans ce formulaire n'est jamais
  remplacé.** Les valeurs par défaut d'une nouvelle fiche (quantité 1 ou 6, couleur « rouge ») comptent comme vides. La couleur
  choisie à la main (puce touchée) n'est pas remplacée. Ensuite, comme pour la photo, `prefillFromKnown` complète depuis un vin
  déjà connu (seulement les champs vides).
- **« Reparler »** (mon choix) : la nouvelle phrase **s'ajoute** au texte compris, et tout le texte est renvoyé ; pour corriger, il
  suffit de le dire (« non, c'est 2015 ») ou de modifier le texte. Les champs que la voix avait remplis prennent la nouvelle
  réponse ; un champ rempli par la voix et absent de la nouvelle réponse est vidé (le texte complet fait foi).
- **Prix** (mon choix) : prix **par bouteille**, comme dans le reste de l'app ; « 120 euros les six » → 20 €. Visible et modifiable.
- **Ce que l'IA renvoie** (schéma JSON, comme la photo) : `transcription`, `nom`, `millesime`, `apogee`, `appellation`, `region`,
  `cepage`, `couleur`, `quantite`, `prix`, `note`, `commentaire`.
- **Validation** (rien d'invalide n'entre dans la fiche) : textes courts nettoyés ; millésime et « à boire jusqu'en » = année sur
  4 chiffres plausible (1900–2100) ; quantité entière 1–99, seulement si la fiche a un champ quantité visible ; prix nombre ≥ 0 ;
  note 0–20 ; couleur dans la liste connue ; commentaire ≤ 300 caractères.
- **Déductions permises** (mon choix, à vérifier par lui comme le reste) : la région et la couleur à partir d'une appellation connue
  (Saint-Julien → Bordeaux, rouge) ; « à boire dans 5 ans » → année calculée à partir de l'année en cours, donnée dans la consigne.
  Rien d'autre : un champ non dit reste vide.
- **Le texte dicté est une donnée** : la consigne interdit d'obéir à une instruction qu'il contiendrait (comme pour l'étiquette).
- **Erreurs** : mêmes messages que la photo (clé, quota, réseau, délai…), plus : micro refusé (« Autorisez le micro quand l'iPhone
  le demande »), rien entendu (« Je n'ai rien entendu : réessayez en parlant près du téléphone »). Le formulaire reste utilisable.
- **Quitter la fiche** pendant l'enregistrement ou l'envoi arrête le micro et ignore la réponse (comme `scanToken`).
- **Réglages** : l'écran « Lecture des étiquettes » devient « Lecture automatique (photo et voix) » et mentionne la voix dans
  l'avertissement Google. Mode d'emploi, README, CHANGELOG mis à jour ; version 0.5.0.

## Laissé au constructeur

- Le détail technique de l'enregistrement (MediaRecorder, choix du type audio supporté) et de l'envoi (données en ligne dans la
  requête Gemini, comme la photo) ; un repli si Gemini refuse le type audio annoncé par l'iPhone.
- La mise en forme exacte (classes CSS, minuterie).
- **À vérifier en premier** : que Gemini accepte l'audio enregistré par Safari sur iPhone. Si ce n'est pas le cas, le secours
  texte (approche 2) reste entièrement fonctionnel.

## Essais avant publication (décidé avec l'utilisatrice)

Dans le **simulateur iOS du Mac**, sur `http://localhost:8765` (page considérée comme sûre : le micro y est autorisé, avec le
micro du Mac). La clé Gemini y est déjà enregistrée par l'utilisatrice ; elle n'est jamais demandée dans la conversation.
Rien n'est publié sur le site de son père avant son accord.
