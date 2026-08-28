#!/usr/bin/env python3
"""
Créateur de backlog Notion — v5

Crée une base de tickets (style Jira) avec le schéma standard :
  propriétés obligatoires, timestamps, tags, version, commentaires,
  et relations self-referencing (dépendances + liens).

Stratégie en deux passes :
  1. POST /databases        → crée la database sans les relations
                              (l'API exige un database_id, inexistant à ce stade)
  2. PATCH /databases/{id}  → ajoute les relations self-referencing

Pré-requis :
  1. Aller sur https://www.notion.so/my-integrations
  2. Cliquer "+ Create new integration"
  3. Nommer : "Backlog Manager"
  4. Copier le token (garder pour après)
  5. Créer une page "Backlogs" dans Notion
  6. Copier l'ID de la page depuis l'URL (e.g https://app.notion.com/p/Backlogs-abcde => abcde)

Usage :
    python3 create_notion_backlog.py \\
        --name "Backlog Mon Projet" \\
        --parent-page-id <ID> \\
        --token <TOKEN>

    Option : --prefix <TICKET_ID_PREFIX>

    # Token dans la variable d'environnement (évite de le saisir à chaque fois) :
    export NOTION_TOKEN=ntn_xxx
    python3 create_notion_backlog.py --name "Backlog Mon Projet" --parent-page-id <ID>

    # Mode interactif (sans arguments) :
    python3 create_notion_backlog.py
"""

import os, sys, argparse, re, unicodedata
from typing import Any
import requests

NOTION_VERSION = "2022-06-28"
BASE_URL       = "https://api.notion.com/v1"


def make_prefix(name: str) -> str:
    """
    Dérive un préfixe d'ID à partir du nom de la backlog.
    Règles : initiales des mots (lettres ASCII uniquement), majuscules, max 5 chars.
    Exemples :
      "Backlog Dharma Project"   -> "BDP"
      "My Project"               -> "MP"
      "Backlog"                  -> "B"
    """
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode()
    words = re.findall(r"[A-Za-z0-9]+", ascii_name)
    prefix = "".join(w[0].upper() for w in words if w)
    return prefix[:5] or "ID"


# ── Étape 1 : schéma sans relations ──────────────────────────────────────────

PROPERTIES_STEP1 = {
    # Obligatoires
    "Titre":       {"title": {}},
    "Description": {"rich_text": {}},
    "Priorité":    {"number": {"format": "number"}},

    "Statut": {
        "select": {
            "options": [
                {"name": "todo",               "color": "gray"},
                {"name": "in progress",        "color": "blue"},
                {"name": "review in progress", "color": "yellow"},
                {"name": "done",               "color": "green"},
                {"name": "cancelled",          "color": "red"},
            ]
        }
    },

    "Genre": {
        "select": {
            "options": [
                {"name": "feature",     "color": "green"},
                {"name": "bug",         "color": "red"},
                {"name": "déploiement", "color": "purple"},
            ]
        }
    },

    # Timestamps — déclarés explicitement (Notion ne les crée pas d'office)
    "Créé le":     {"created_time": {}},
    "Modifié le":  {"last_edited_time": {}},

    # Optionnelles
    "Tags": {
        "multi_select": {
            "options": [
                {"name": "refactoring",     "color": "orange"},
                {"name": "UI",              "color": "purple"},
                {"name": "API",             "color": "blue"},
                {"name": "base de données", "color": "brown"},
                {"name": "performance",     "color": "red"},
                {"name": "sécurité",        "color": "pink"},
                {"name": "documentation",   "color": "gray"},
            ]
        }
    },

    "Version":      {"rich_text": {}},
    "Commentaires": {"rich_text": {}},
}


# ── Étape 2 : relations self-referencing ─────────────────────────────────────

def build_relation_properties(db_id: str) -> dict:
    """
    dual_property crée automatiquement l'inverse dans Notion :
      "Dépend de" ↔ "Est une dépendance de"
    single_property pour "En rapport avec" (symétrique, pas d'inverse distinct).
    """
    return {
        "Dépend de": {
            "relation": {
                "database_id": db_id,
                "type": "dual_property",
                "dual_property": {
                    "synced_property_name": "Est une dépendance de"
                },
            }
        },
        "En rapport avec": {
            "relation": {
                "database_id": db_id,
                "type": "single_property",
                "single_property": {},
            }
        },
    }


# ── Tickets d'exemple ─────────────────────────────────────────────────────────

SAMPLE_TICKETS = [
    {
        "Titre": "Configuration du projet et stack technique",
        "Description": (
            "Initialiser le projet avec la stack Dharma Project.\n\n"
            "## ✅ Definition of Done\n"
            "- [ ] Repo git créé et configuré\n"
            "- [ ] Dépendances installées\n"
            "- [ ] Linter configuré\n"
            "- [ ] Structure de dossiers validée"
        ),
        "Priorité": 5000,
        "Statut":   "in progress",
        "Genre":    "feature",
        "Version":  "1.0",
        "Tags":     ["refactoring"],
    },
    {
        "Titre": "Mise en place de la CI/CD",
        "Description": (
            "Configurer le pipeline d'intégration continue.\n\n"
            "## ✅ Definition of Done\n"
            "- [ ] Pipeline GitHub Actions fonctionnel\n"
            "- [ ] Tests exécutés automatiquement à chaque push\n"
            "- [ ] Rapport de code coverage publié"
        ),
        "Priorité": 4500,
        "Statut":   "todo",
        "Genre":    "déploiement",
        "Version":  "1.0",
    },
    {
        "Titre": "Implémenter la page d'accueil",
        "Description": (
            "Créer la landing page du projet.\n\n"
            "## ✅ Definition of Done\n"
            "- [ ] Design pixel-perfect\n"
            "- [ ] Responsive (mobile, tablette, desktop)\n"
            "- [ ] Tests E2E passants"
        ),
        "Priorité": 4000,
        "Statut":   "todo",
        "Genre":    "feature",
        "Tags":     ["UI"],
    },
]


# ── Client ────────────────────────────────────────────────────────────────────

class NotionBacklogCreator:

    def __init__(self, token: str, parent_page_id: str, name: str, prefix: str | None = None) -> None:
        self.parent_page_id = parent_page_id
        self.name = name
        self.prefix = prefix  # None = auto-dérivé du nom
        self.headers = {
            "Authorization":  f"Bearer {token}",
            "Content-Type":   "application/json",
            "Notion-Version": NOTION_VERSION,
        }
        self.db_id: str | None = None

    def _post(self, path: str, payload: dict) -> dict:
        r = requests.post(f"{BASE_URL}{path}", headers=self.headers, json=payload)
        if r.status_code not in (200, 201):
            print(f"\n❌  Erreur {r.status_code} — POST {path}")
            print(r.text)
            sys.exit(1)
        return r.json()

    def _patch(self, path: str, payload: dict) -> dict:
        r = requests.patch(f"{BASE_URL}{path}", headers=self.headers, json=payload)
        if r.status_code not in (200, 201):
            print(f"\n❌  Erreur {r.status_code} — PATCH {path}")
            print(r.text)
            sys.exit(1)
        return r.json()

    def step1_create_database(self) -> None:
        print("① Création de la database (sans relations)…")
        prefix = self.prefix.upper()[:5] if self.prefix else make_prefix(self.name)
        print(f"   Préfixe ID : {prefix}")
        properties = {
            **PROPERTIES_STEP1,
            "ID": {"unique_id": {"prefix": prefix}},
        }
        data = self._post("/databases", {
            "parent":     {"type": "page_id", "page_id": self.parent_page_id},
            "title":      [{"type": "text", "text": {"content": self.name}}],
            "properties": properties,
        })
        self.db_id = data["id"]
        print(f"   ✅ Database créée — ID : {self.db_id}")

    def step2_add_relations(self) -> None:
        print("② Ajout des relations self-referencing…")
        self._patch(f"/databases/{self.db_id}", {
            "properties": build_relation_properties(self.db_id)
        })
        print("   ✅ 'Dépend de' + 'Est une dépendance de' (auto) + 'En rapport avec'")

    def step3_create_sample_tickets(self) -> None:
        print("③ Création des tickets d'exemple…")
        for ticket in SAMPLE_TICKETS:
            self._create_page(ticket)

    def _create_page(self, ticket: dict[str, Any]) -> None:
        props: dict[str, Any] = {}
        for key, val in ticket.items():
            if key == "Titre":
                props["Titre"] = {"title": [{"type": "text", "text": {"content": val}}]}
            elif key == "Description":
                props["Description"] = {"rich_text": [{"type": "text", "text": {"content": val}}]}
            elif key == "Priorité":
                props["Priorité"] = {"number": val}
            elif key == "Statut":
                props["Statut"] = {"select": {"name": val}}
            elif key == "Genre":
                props["Genre"] = {"select": {"name": val}}
            elif key == "Version":
                props["Version"] = {"rich_text": [{"type": "text", "text": {"content": val}}]}
            elif key == "Tags":
                props["Tags"] = {"multi_select": [{"name": t} for t in val]}
        self._post("/pages", {"parent": {"database_id": self.db_id}, "properties": props})
        print(f"   ✅ {ticket['Titre'][:55]}")

    def run(self) -> None:
        sep = "─" * 60
        print(f"\n{sep}\n🚀  {self.name} — setup Notion\n{sep}\n")

        self.step1_create_database()
        self.step2_add_relations()
        self.step3_create_sample_tickets()

        print(f"\n{sep}")
        print(f"🎉  Tout est prêt !   Database ID : {self.db_id}")
        print(f"{sep}")
        print("""
📌  PROCHAINES ÉTAPES

  1. Rafraîchir Notion (F5).
  2. Déplacer la colonne "ID" en première position (glisser l'en-tête).
  3. Créer vos vues :
       • "À faire"  : Statut = todo        | Tri Priorité ↓
       • "En cours" : Statut = in progress  | Tri Modifié le ↓
       • "Critique" : Priorité ≥ 4000 ET Statut ∉ {done, cancelled}
  4. C'est parti ! 🚀
""")


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description="Crée une base de tickets Notion")
    p.add_argument("--name",           default=None, help="Nom de la backlog (ex: 'Backlog Dharma Project')")
    p.add_argument("--prefix",         default=None, help="Préfixe d'ID (ex: 'DHA'). Par défaut : initiales du nom, max 5 chars (ex: BDP).")
    p.add_argument("--parent-page-id", default=None, help="ID de la page parente dans Notion")
    p.add_argument("--token",          default=os.environ.get("NOTION_TOKEN"), help="Token API Notion")
    args = p.parse_args()

    if not args.name:
        args.name = input("Nom de la backlog : ").strip()
    if not args.parent_page_id:
        args.parent_page_id = input("Page ID Notion (parent) : ").strip()
    if not args.token:
        args.token = input("Token API Notion : ").strip()

    NotionBacklogCreator(args.token, args.parent_page_id, args.name, args.prefix).run()


if __name__ == "__main__":
    main()
