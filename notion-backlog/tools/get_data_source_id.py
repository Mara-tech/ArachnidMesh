#!/usr/bin/env python3
"""
Récupère l'URI collection://<data_source_id> d'une database Notion
à partir de son ID ou de son URL complète.

Usage:
    export NOTION_TOKEN="ntn_xxx"
    python get_data_source_id.py "https://app.notion.com/p/a1b2c3d4e5f64789abcd0123456789ef?v=..."
    python get_data_source_id.py a1b2c3d4e5f64789abcd0123456789ef

Nécessite: pip install requests
"""

import os
import re
import sys
import requests

NOTION_VERSION = "2025-09-03"
API_BASE = "https://api.notion.com/v1"

# Les URLs Notion terminent toujours l'ID juste avant un "?" ou la fin de
# chaîne, précédé d'un "-" ou d'un "/" (jamais collé à d'autres hex du slug).
# On ancre donc sur la fin pour éviter de capturer un fragment du slug.
UUID_RE = re.compile(
    r"[-/]([0-9a-fA-F]{32})(?:\?|$)"
)
# Cas où l'argument est un ID brut (avec ou sans tirets), sans URL autour.
BARE_UUID_RE = re.compile(
    r"^([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})$"
)


def _to_dashed(hex32: str) -> str:
    return f"{hex32[0:8]}-{hex32[8:12]}-{hex32[12:16]}-{hex32[16:20]}-{hex32[20:32]}"


def extract_id(raw: str) -> str:
    """Extrait un UUID (avec tirets) depuis une URL Notion ou un ID brut/sans tirets.

    Ancré en fin de chaîne pour éviter de capturer un fragment hexadécimal
    présent plus tôt dans un slug de titre (ex: '.../Rediger-un-ticket-<id>').
    """
    raw = raw.strip()

    bare = BARE_UUID_RE.match(raw)
    if bare:
        return "-".join(bare.groups())

    match = UUID_RE.search(raw)
    if not match:
        raise ValueError(f"Impossible de trouver un ID Notion valide dans : {raw!r}")
    return _to_dashed(match.group(1))


def get_database(database_id: str, token: str) -> dict:
    url = f"{API_BASE}/databases/{database_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_page(page_id: str, token: str) -> dict:
    """Fallback si l'ID pointe vers une page simple (pas une database)."""
    url = f"{API_BASE}/pages/{page_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <notion_url_or_id>", file=sys.stderr)
        sys.exit(1)

    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("Erreur: variable d'environnement NOTION_TOKEN manquante.", file=sys.stderr)
        sys.exit(1)

    raw_input_arg = sys.argv[1]
    obj_id = extract_id(raw_input_arg)

    # 1. On tente d'abord comme database
    try:
        db = get_database(obj_id, token)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            # 2. Pas une database -> peut-être une simple page
            try:
                page = get_page(obj_id, token)
                title_fragments = (page.get("properties", {}).get("title", {}) or {}).get("title", [])
                title = "".join(t.get("plain_text", "") for t in title_fragments) or "(sans titre)"
                print(f"Page: {title}")
                print(f"Page ID: {page.get('id')}")
                print(f"Page URL: {page.get('url')}")
                print()
                print("Ceci est une page standard (type: page), pas une database.")
                print("Les pages standard n'ont pas de data source associé : le concept")
                print("collection://<id> n'existe que pour les databases.")
                sys.exit(0)
            except requests.HTTPError as e2:
                print(f"Erreur API Notion: {e2.response.status_code} {e2.response.text}", file=sys.stderr)
                sys.exit(1)
        else:
            print(f"Erreur API Notion: {e.response.status_code} {e.response.text}", file=sys.stderr)
            sys.exit(1)

    title_fragments = db.get("title", [])
    title = "".join(t.get("plain_text", "") for t in title_fragments) or "(sans titre)"

    data_sources = db.get("data_sources", [])
    if not data_sources:
        print("Aucun data source trouvé sur cette database (inattendu).", file=sys.stderr)
        sys.exit(1)

    print(f"Database: {title}")
    print(f"Database ID: {db.get('id')}")
    print(f"Nombre de data sources: {len(data_sources)}")
    print()
    for ds in data_sources:
        ds_id = ds["id"]
        ds_name = ds.get("name", "")
        print(f"  - {ds_name!r}")
        print(f"    collection://{ds_id}")


if __name__ == "__main__":
    main()