>🤖
>Cette page dit **comment un besoin exprimé en langage naturel devient un ticket exploitable**. Son premier lecteur est celui qui formalise le besoin et crée la page — humain ou agent ; son second est celui qui prendra le ticket, des semaines plus tard, sans rien savoir de la conversation qui l'a produit.
>Elle est **commune à toutes les backlogs** de cet espace et ne suppose rien du domaine : elle vaut pour un projet de code comme pour n'importe quel autre travail qui se dépile.


## Comment la backlog est utilisée

Une backlog ici n'est pas une liste de souhaits, c'est **une file**. Elle se dépile **une tâche à la fois, par priorité décroissante** : celui qui exécute prend le ticket `todo` de plus haute priorité dont toutes les dépendances sont `done`, le passe `in progress`, le mène jusqu'au bout, rend compte dans le corps de la page, puis le passe `review in progress`. Le passage à `done` appartient au relecteur humain, jamais à l'exécutant. Une seule tâche est ouverte à la fois : il n'y a pas de parallélisme à répartir, seulement un ordre à respecter.

Quatre conséquences, et elles gouvernent tout le reste de cette page :

- **Le ticket est lu seul.** Ce qui a été dit et qui compte doit être écrit dans le ticket, sinon c'est perdu.
- **La priorité est une position dans la file**, pas une humeur. Écrire un ticket, c'est décider ce qui passe avant et ce qui passe après.
- **Un ticket = une livraison.** Ce qui ne peut pas être terminé d'un bloc n'est pas un ticket, c'est deux.
- **Écrire un ticket ne le démarre pas.** Le rôle de celui qui formalise s'arrête à la création, en `todo`. Le lancement d'une itération appartient au propriétaire de la backlog.

## Avant d'écrire : lire le schéma de la base

- **Les propriétés décrites plus bas sont le modèle commun, pas une garantie.** Une base peut en avoir moins, ou en avoir d'autres. Lire le schéma réel de la base visée avant de créer quoi que ce soit, et n'écrire que dans des propriétés qui existent.
- **Ne jamais inventer une valeur de liste** (`select`, `multi-select`). Prendre une option existante ; si aucune ne convient, le dire et demander qu'on en ajoute une. Une option créée à la volée fragmente la base en silence et personne ne s'en aperçoit avant le premier filtre qui rate.
- **Vérifier qu'un ticket équivalent n'existe pas déjà**, en cherchant sur les mots du besoin et pas sur son titre supposé. S'il existe, on le complète — on n'en crée pas un second.

## Les propriétés

| Propriété | Obligatoire | Ce qu'elle porte |
| --- | --- | --- |
| **Titre** | Oui | Le résultat attendu, en une phrase lisible seule |
| **Statut** | Oui — `todo` | La position dans le cycle de vie. Toujours `todo` à la création |
| **Priorité** | Oui | Un nombre. Le plus grand se dépile en premier |
| **Genre** | Oui, si la base en a un | Ce que le ticket est : évolution, correction, déploiement… |
| **Description** | Oui | Le ticket autoportant : constat, conséquence, Definition of Done |
| **Corps de la page** | Dès qu'il y a du détail | L'analyse, les options écartées, les références. Reçoit ensuite le rapport d'exécution |
| **Dépend de** | Si et seulement si bloquant | Les tickets qui doivent être `done` — ou `cancelled` — avant que celui-ci puisse commencer |
| **En rapport avec** | Facultatif | Même terrain, aucune contrainte d'ordre |
| **Tags** | Facultatif | De quoi filtrer. Aucun tag vaut mieux qu'un tag approximatif |
| **Version** | Facultatif | Le jalon visé — à laisser vide si la base ne suit pas de versions |
| **Commentaires** | Facultatif | Une ligne de synthèse, au plus. Jamais un rapport |
| **ID**, **Créé le**, **Modifié le** | Automatique | Gérés par Notion — ne jamais écrire dedans |

### Titre

Une phrase courte qui dit **le résultat attendu ou le fait constaté**, pas l'activité à mener. Elle doit se comprendre seule dans une vue liste, sans ouvrir la page.

- ❌ « Améliorer l'export » → ✅ « L'export CSV perd les accents »
- ❌ « Point budget » → ✅ « Arbitrer le budget déplacements du T4 »

Pas de numéro ni de préfixe dans le titre : l'ID est déjà une propriété, et un titre préfixé se désynchronise le jour où on réordonne. **Un ticket se désigne ensuite par son ID**, jamais par son titre — dans les autres tickets, dans les rapports, dans les commentaires : un titre se reformule, un ID non.

### Statut

À la création, **toujours** `todo`, sans exception. Un ticket créé directement en `in progress` sort de la file sans que personne ne l'ait pris : il ne sera jamais dépilé, et il ne se verra pas.

La suite ne concerne pas celui qui écrit : `in progress` et `review in progress` appartiennent à l'exécutant, `done` au relecteur.

`cancelled` est la seule autre sortie de la file, et elle appartient au **propriétaire de la backlog** : un ticket y passe quand le besoin a disparu — devenu obsolète, arbitré autrement, ou absorbé par un autre ticket. Ni l'exécutant ni le relecteur ne l'y mettent, et jamais parce que le travail s'est révélé plus dur que prévu : ça, c'est un ticket à éclater, pas à annuler. Dire dans `Commentaires` ce qui l'a rendu caduc, et l'ID de celui qui le remplace s'il y en a un — sans cette phrase, une annulation ne se distingue pas d'un abandon.

### Priorité

Un nombre, **le plus grand passe en premier**. C'est le seul ordre de la file : rien d'autre — ni la date de création, ni l'ID, ni la gravité ressentie — ne décide de ce qui sort en premier.

Poser une priorité, c'est répondre à une question concrète : **entre quels deux tickets existants celui-ci passe-t-il ?** On lit les priorités voisines et on se place entre elles.

- **Laisser des trous.** Un pas de 100 entre deux tickets permet d'insérer plus tard sans rien renuméroter. Un pas de 1 oblige à tout décaler dès la première insertion.
- **Ne pas dupliquer une priorité existante** : deux ex æquo laissent l'ordre au hasard, et le hasard tombera sur celui qui est bloqué.
- **Annoncer le choix.** La priorité est au jugement du propriétaire de la backlog : on la propose avec sa raison en une phrase, on ne l'impose pas. Quand elle est discutable, le dire dans le corps de la page.

### Genre

Ce que le ticket **est**, pas ce qu'il touche — ce dernier, ce sont les `Tags`. Le `Genre` déclenche souvent une mécanique en aval (par exemple, sur un projet de code, le préfixe de la branche), d'où l'importance de le prendre dans les options existantes.

Si le besoin n'entre dans aucun genre, c'est en général qu'il n'est pas encore un ticket : c'est une idée, une question, ou trois tâches emmêlées.

### Description

C'est **le ticket lui-même**, celui qu'on doit pouvoir lire sans ouvrir la page. Trois choses, dans cet ordre :

1. **Le constat** — le fait observable, avec sa référence et sa date de vérification. Pas « il semble que », pas « on pense que » : ce qui a été vu, et où.
2. **La conséquence** — ce que ça coûte aujourd'hui, ou ce que ça débloque demain. C'est ce qui justifie la priorité, et c'est ce qui manque le plus souvent.
3. **La Definition of Done** — voir juste en dessous.

Deux règles qui valent partout mais qui se jouent ici :

- **Ce qui est vérifié et ce qui est supposé ne se mélangent pas.** « Mesuré le 12/03 sur les trois derniers exports » et « ça a probablement toujours été le cas » ne sont pas la même phrase, et celui qui exécutera n'a aucun moyen de refaire le tri.
- **Un arbitrage non tranché s'annonce en première ligne**, avec un ⚠️. Sans ça, le ticket sera pris pour une tâche exécutable, et quelqu'un tranchera seul, en passant, sans savoir qu'il tranchait.

### La Definition of Done

Une liste de cases à cocher. Chacune décrit **un état constatable par quelqu'un d'autre que l'auteur** : on doit pouvoir répondre oui ou non sans discuter.

- ❌ « Améliorer la lisibilité du rapport » → ✅ « Le rapport tient sur une page et chaque chiffre cite sa source »
- ❌ « Corriger le bug » → ✅ « Un export contenant des accents est relu à l'identique ; le contrôle échoue avant le correctif et passe après »

Y faire figurer aussi **ce qui est délibérément hors périmètre**, quand la tentation est prévisible : « aucune modification de l'interface dans ce ticket ». C'est ce qui empêche un ticket de grossir en cours de route jusqu'à devenir irrelisible.

Les cases **se cochent au fil du travail**, par celui qui exécute, et seulement quand c'est vrai : une case non cochée est le signal honnête qu'il reste quelque chose, une case cochée est une affirmation que le suivant croira sans revérifier.

>🎯
**Une Definition of Done qu'on n'arrive pas à écrire est le signe d'un besoin pas encore compris.** C'est le moment de poser la question — pas après, quand le travail aura été fait dans la mauvaise direction.


### Corps de la page

La `Description` porte le ticket condensé ; le corps porte tout ce qui ne tient pas dedans et qui serait perdu autrement. Un plan qui fonctionne :

- **Le constat** — les faits en détail, leurs références (fichier, document, capture, source), la date de vérification.
- **À faire** — la substance, sans imposer une solution qui n'a pas été décidée.
- **Definition of Done** — quand elle est trop longue pour la propriété.
- **Hors périmètre** — ce que le ticket ne fait pas, exprès.
- **Priorité** — la position choisie et pourquoi, quand elle n'est pas évidente.

Le corps reçoit ensuite **le rapport d'exécution**, en fin de page — ce qu'il porte a sa propre section plus bas. Ne pas le remplir en créant le ticket : il appartient à celui qui exécute.

### Dépend de, En rapport avec

`Dépend de` est **bloquant**, et rien d'autre n'y entre : le ticket ne peut pas commencer tant que la cible n'est pas `done` — ou `cancelled`, une dépendance annulée ne bloque plus rien. « Ce serait plus confortable après » n'est pas une dépendance.

>⚠️
>**Règle de cohérence :** un ticket ne doit jamais avoir une priorité **supérieure** à celle d'un ticket dont il dépend. La file se dépile sur la seule priorité — un ticket bloqué en tête de file est une anomalie qui coûte un aller-retour à celui qui le prend, et qui oblige à réordonner la backlog avant de pouvoir travailler.

`En rapport avec` relie deux tickets qui touchent le même terrain, sans contrainte d'ordre. C'est ce qu'on met quand on hésite : **dans le doute, non bloquant** — un faux lien coûte une lecture, une fausse dépendance bloque une file.

### Tags, Version, Commentaires

- **Tags** : de quoi filtrer plus tard. N'en poser que s'ils sont vrais et utiles ; ne pas y répéter le `Genre`.
- **Version** : à ne remplir que si la base suit réellement des versions ou des jalons. Vide vaut mieux qu'inventé.
- **Commentaires** : une ligne de texte brut, le pointeur vers le livrable en cours et son état (e.g le lien de la Pull Request), une phrase de synthèse au plus. Tout ce qui dépasse une phrase va dans le corps de la page, où c'est lisible.

## Un ticket, une livraison

Quatre signes qu'on est en train d'écrire deux tickets dans un seul :

- la Definition of Done contient un « et » entre deux résultats indépendants ;
- une moitié est bloquée par une décision, l'autre non ;
- les deux moitiés pourraient être livrées à des semaines d'écart sans se gêner ;
- il faut deux constats sans rapport pour justifier le ticket.

Dans ces cas : deux tickets, reliés par `Dépend de` si l'ordre compte, par `En rapport avec` sinon.

De même, **ce qu'on découvre en écrivant un ticket et qui n'y appartient pas devient son propre ticket**, tout de suite. Une remarque glissée dans un corps de page se perd ; un ticket se dépile.

## Les tickets qui sont des décisions

Certains besoins ne sont pas exécutables : ils attendent un arbitrage que celui qui écrit n'a pas à rendre. Ils restent des tickets — mais ils le disent dès la première ligne, et leur Definition of Done porte sur **la décision**, pas sur l'implémentation :

- [ ]  Les options sont présentées avec leur coût réel, chiffré sur ce projet
- [ ]  Une recommandation est faite, disant honnêtement ce dont on n'est pas sûr
- [ ]  Le propriétaire du projet a tranché
- [ ]  Le choix retenu est mis en œuvre — et pas avant l'arbitrage

## Le rapport d'exécution

Un ticket ne se termine pas quand sa Definition of Done est cochée : il se termine quand le corps de sa page dit **ce qui s'est passé**. Cette partie appartient à celui qui exécute, et elle s'adresse à quelqu'un qui n'a ni la conversation, ni le travail, ni les hésitations — souvent le même, des mois plus tard.

Elle s'écrit **le jour de la livraison** : reconstituée trois semaines après, elle a déjà perdu ce qui faisait son prix. On l'ouvre par sa date (« Fait le AAAA-MM-JJ ») et on la place à la fin du corps, sous le contenu d'origine : le ticket se lit alors dans l'ordre où il a vécu.

Ce qu'un bon rapport porte, du plus précieux au moins :

- **Les arbitrages rendus** — la décision, **l'option écartée, et la raison de l'écarter**. C'est la seule chose que personne ne peut reconstituer après coup : le résultat se lit dans le livrable, le chemin non. Quand une décision est réversible, dire sous quelle condition elle se retourne — c'est ce qui évite de refaire le débat au lieu de constater que la condition est remplie.
- **Les constats faits en passant et non traités** — ce qu'on a vu et délibérément pas corrigé : pourquoi c'est sans conséquence aujourd'hui, à partir de quand ça mordra, et **le ticket qui le porte désormais**. Un constat sans ticket est un constat perdu.
- **Les preuves, avec leurs chiffres** — ce qui a été vérifié et *comment*. « Avant : X, après : Y » se relit ; « nettement amélioré » ne se relit pas. Et quand une vérification a elle-même été mise à l'épreuve — on a cassé exprès ce qu'elle surveille pour voir si elle tombait — le dire : c'est la différence entre un contrôle et un contrôle qui sert.
- **Les réserves** — ce que la livraison ne prouve **pas** : un cas non couvert, un contrôle qui fige le comportement actuel faute de règle écrite, une vérification qu'on n'a pas su faire. Une réserve écrite coûte une phrase ; découverte plus tard par quelqu'un d'autre, elle coûte une enquête.
- **Les choix de structure** — où la chose a été posée, et pourquoi là plutôt qu'ailleurs. Le prochain qui voudra la déplacer saura ce qu'il casse.
- **Les à-côtés** — les petites modifications faites au passage et leur raison. Ce sont elles qu'on ne s'explique plus six mois après.

Deux choses qui n'y ont pas leur place :

- **le récit chronologique** — ce qu'on a essayé puis abandonné n'intéresse que si l'abandon est une décision ;
- **l'auto-évaluation** — « travail propre », « bien couvert » : ni vérifiable, ni utile. Ce sont les chiffres et les réserves qui portent le jugement, et ils le portent mieux.

>⏳
>**Le rapport est le seul endroit où le « pourquoi » survit.** Le livrable montre ce qui a été fait, l'historique montre quand — mais le raisonnement qui a produit les décisions, lui, ne laisse aucune trace ailleurs. Ce qui n'est pas écrit là est perdu, et c'est en général exactement ce que le suivant viendra chercher.

## Modèle

```markdown
Titre        : <le résultat attendu, ou le fait constaté>
Statut       : todo
Priorité     : <entre le ticket X et le ticket Y>
Genre        : <une option existante de la base>

Description  :
  ⚠️ <à ne mettre que s'il reste un arbitrage à rendre>

  <Constat : le fait observable, sa référence, sa date de vérification.>
  <Conséquence : ce que ça coûte aujourd'hui, ou ce que ça débloque.>

  ## ✅ Definition of Done
  - [ ] <un état constatable par un tiers>
  - [ ] <…>
  - [ ] <ce qui est délibérément hors périmètre>

Corps de page :
  ## Le constat        <les faits en détail, avec leurs références>
  ## À faire           <la substance, sans imposer une solution non décidée>
  ## Hors périmètre    <ce que le ticket ne fait pas, exprès>
  ## Priorité          <la position choisie et pourquoi>
```

## Avant de créer la page

- [ ]  Le schéma réel de la base a été lu ; aucune valeur de liste n'a été inventée
- [ ]  Aucun ticket équivalent n'existe déjà
- [ ]  Le titre dit le résultat attendu et se lit seul
- [ ]  `Statut` = `todo`
- [ ]  `Priorité` posée par rapport aux tickets voisins, sans doublon, jamais au-dessus d'une dépendance
- [ ]  `Genre` pris dans les options existantes
- [ ]  La `Description` est autoportante : constat, conséquence, Definition of Done
- [ ]  Chaque case de la Definition of Done est vérifiable par un tiers
- [ ]  Ce qui est vérifié est distingué de ce qui est supposé
- [ ]  Les arbitrages non tranchés sont annoncés en tête, avec ⚠️
- [ ]  `Dépend de` ne contient que du bloquant
- [ ]  Le ticket se lit sans la conversation qui l'a produit

>🧭
>**Le test final.** Relire le ticket en se demandant si quelqu'un qui n'était pas là peut le prendre dans trois mois, savoir quoi faire, et savoir à quel moment il a fini. Si la réponse est non, ce qui manque est presque toujours l'un des deux : le constat vérifié, ou la Definition of Done.