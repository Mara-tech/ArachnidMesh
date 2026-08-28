# Projet

<Project name and very basic presentation>

## Contexte et objectifs

Ce projet aide le projet <Project name> dans le sens où il peut se connecter à la backlog Notion pour créer
des tickets afin d'enrichir le projets de features, corriger des bugs, renforcer les tests, améliorer la CI/CD, etc.
La backlog est une base de données Notion, accessible sur <your-notion-database> auquel tu as accès.

### Détails portés par un ticket

The properties that carry meaning

| Property          |                                                                                      |
|-------------------|--------------------------------------------------------------------------------------|
| `Statut`          | `todo` → `in progress` → `review in progress` → `done`; `cancelled` at any point     |
| `Priorité`        | a number, **highest first**. The next ticket is the top `todo` by this order         |
| `Genre`           | `feature`, `bug`, `déploiement` — decides the branch prefix                          |
| `Dépend de`       | must all be `done` or `cancelled` before a ticket can start                          |
| `En rapport avec` | touches the same ground, but does not block                                          |
| `Description`     | a brief summary                                                                      |
| `Commentaires`    | single-line plain text. One synthesis sentence at most — reports go in the page body |

The page body renders in markdown, so is more appropriate to all details, incuding a clear Definition of Done. You may
choose checkboxes to list items that should be checked before marking the ticket done (or review in progress)

## Exemple de requête utilisateur

### 1. Créer un ticket

L'utilisateur demande à Claude de rédiger et créer un ticket dans la backlog Notion à partir d'une description plus ou
moins brève qu'il doit fournir.
Les instructions pour ce genre de demande se situe dans la page Notion : <your-ticket-writing-instructions-notion-page>.
Pour compléter : Claude vérifie si des tickets en rapport avec ces aspects, et détermine si c'est un doublon, ou si des
liens `Dépend de` ou `En rapport avec` seront à établir au moment de créer ce ticket.
La priorité pourra être exigée ou demandée par l'utilisateur. Dans le cas où le ticket à créer sera dépendant d'un
autre, il faudra confronter celle suggérée par rapport aux tickets nécessitant d'être faits avant. L'utilisateur pourra
toutefois avoir le dernier mot : quoiqu'il en soit, le skill qui dépile les tickets vérifie que tous les tickets
nécessaires sont terminés avant d'entamer une tâche. Affiche dans une table chaque propriété que tu comptes insérer pour
ce ticket, puis suggère à l'utilisateur de répondre un simple "ok" pour confirmation avant la création effective. Si au
contraire, l'utilisateur envoie une remarque, c'est certainement au niveau de la description ou des détails qu'il faut
rectifier.

### 2. Analyse ou Modification de la backlog

L'utilisateur peut vouloir récupérer et afficher des statistiques, ou bien rajouter une propriété ou une valeur possible
à une option ("enum").