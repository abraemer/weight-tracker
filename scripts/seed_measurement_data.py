#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Seed deterministic measurement users into the weight tracker API.

Ensures three users exist with exactly N entries each:
    Seed76   -> 76 entries
    Seed276  -> 276 entries
    Seed1000 -> 1000 entries

Entry i (i = 0..N-1) has UTC timestamp 2026-01-01T07:30:00Z + i*86400s and
weight_kg = 50 + i*0.01, so the newest weight of SeedN is 50 + (N-1)*0.01.

Idempotent: users are created only if absent, and entries are topped up by
POSTing only the timestamps that are missing. A second run posts nothing.

--cleanup deletes the three seed users (unconditional legacy DELETE path).

Usage:
    uv run scripts/seed_measurement_data.py [--api-url URL] [--cleanup]
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

API_URL = "http://localhost:3000/api"

SEED_USERS = [
    ("Seed76", 76),
    ("Seed276", 276),
    ("Seed1000", 1000),
]

BASE_TIME = datetime(2026, 1, 1, 7, 30, 0, tzinfo=timezone.utc)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Seed deterministic users for switch-latency measurement",
    )
    parser.add_argument(
        "--api-url",
        default=API_URL,
        help=f"API URL (default: {API_URL})",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete the three seed users instead of seeding",
    )
    return parser.parse_args()


def request(method: str, url: str, body: dict | None = None) -> object:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = response.read()
            if not payload:
                return None
            return json.loads(payload)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:200]
        print(f"Error: {method} {url} failed with HTTP {e.code}: {detail}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Error: Could not connect to {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)


def expected_timestamp(i: int) -> str:
    dt = BASE_TIME + timedelta(seconds=i * 86400)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def expected_entries(count: int) -> list[dict]:
    return [
        {
            "timestamp": expected_timestamp(i),
            "weight_kg": 50 + i * 0.01,
        }
        for i in range(count)
    ]


def get_users(api_url: str) -> list[dict]:
    return request("GET", f"{api_url}/users")


def seed(api_url: str):
    users = get_users(api_url)
    users_by_name: dict[str, int] = {u["name"]: u["id"] for u in users}

    for name, count in SEED_USERS:
        if name not in users_by_name:
            created = request("POST", f"{api_url}/users", {"name": name})
            user_id = created["id"]
            print(f"Created user {name} (ID {user_id})")
        else:
            user_id = users_by_name[name]
            print(f"User {name} already exists (ID {user_id})")

        existing = request("GET", f"{api_url}/users/{user_id}/entries")
        present = {e["timestamp"] for e in existing}

        missing = [
            e for e in expected_entries(count) if e["timestamp"] not in present
        ]
        for entry in missing:
            request("POST", f"{api_url}/users/{user_id}/entries", entry)
        print(f"{name}: {len(present)} present, {len(missing)} added (target {count})")


def cleanup(api_url: str):
    users = get_users(api_url)
    users_by_name: dict[str, int] = {u["name"]: u["id"] for u in users}

    for name, _ in SEED_USERS:
        if name not in users_by_name:
            print(f"{name}: not present, nothing to delete")
            continue
        user_id = users_by_name[name]
        request("DELETE", f"{api_url}/users/{user_id}")
        print(f"Deleted user {name} (ID {user_id})")


def main():
    args = parse_args()
    api_url = args.api_url.rstrip("/")

    if args.cleanup:
        cleanup(api_url)
    else:
        seed(api_url)


if __name__ == "__main__":
    main()
