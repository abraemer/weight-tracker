#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
One-time CSV import script for weight tracker.

Usage:
    python import_csv.py --user "Alice" --file weights.csv [--dry-run]

CSV format (header required):
    date,time,weight
    2024-01-15,08:30,75.5
    2024-01-16,09:00,75.2

Date format: YYYY-MM-DD
Time format: HH:MM (24-hour)
Weight: number in kg
"""

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

API_URL = "http://localhost:3000/api"


def normalize_url(url: str) -> str:
    """Remove trailing slash from URL."""
    return url.rstrip("/")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import weight entries from CSV",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
CSV format (header required):
  date,time,weight
  2024-01-15,08:30,75.5
  2024-01-16,09:00,75.2

Date format: YYYY-MM-DD
Time format: HH:MM (24-hour)
Weight: number in kg

Examples:
  uv run scripts/import_csv.py --user "Alice" --file weights.csv --dry-run
  uv run scripts/import_csv.py --user "Alice" --file weights.csv
""",
    )
    parser.add_argument("--user", required=True, help="User name (must exist)")
    parser.add_argument("--file", required=True, help="CSV file to import")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and display data without inserting",
    )
    parser.add_argument(
        "--api-url",
        default=API_URL,
        help=f"API URL (default: {API_URL})",
    )
    return parser.parse_args()


def get_user_id(name: str, api_url: str) -> int | None:
    """Fetch user ID by name. Returns None if not found."""
    url = f"{api_url}/users"
    response = None
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        users = response.json()
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to {url}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.Timeout:
        print(f"Error: Request to {url} timed out", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.JSONDecodeError:
        print(f"Error: Invalid JSON response from {url}", file=sys.stderr)
        if response is not None:
            print(f"Response text: {response.text[:200]}", file=sys.stderr)
        sys.exit(1)

    matching = [u for u in users if u["name"] == name]
    if not matching:
        return None
    return matching[0]["id"]


def parse_csv(filepath: str) -> list[dict]:
    """Parse CSV file and return list of entries."""
    entries = []

    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row_num, row in enumerate(reader, start=2):
            try:
                date_str = row["date"].strip()
                time_str = row["time"].strip()
                weight_str = row["weight"].strip()

                # Parse date and time
                date = datetime.strptime(date_str, "%Y-%m-%d").date()
                time = datetime.strptime(time_str, "%H:%M").time()

                # Parse weight
                weight = float(weight_str)
                if weight <= 0:
                    raise ValueError(f"Weight must be positive: {weight}")

                # Combine to local datetime, then convert to UTC
                local_dt = datetime.combine(date, time)
                # Assume the input is in local time, convert to UTC
                # For simplicity, we assume UTC offset is 0 (user should adjust)
                # Or we could use: local_dt.astimezone(timezone.utc)
                utc_timestamp = local_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

                entries.append({
                    "date": date_str,
                    "time": time_str,
                    "weight_kg": weight,
                    "utc_timestamp": utc_timestamp,
                    "row": row_num,
                })

            except KeyError as e:
                print(f"Row {row_num}: Missing column {e}", file=sys.stderr)
                sys.exit(1)
            except ValueError as e:
                print(f"Row {row_num}: Parse error - {e}", file=sys.stderr)
                sys.exit(1)

    return entries


def print_dry_run(user_name: str, user_id: int, entries: list[dict]):
    """Print parsed data for review."""
    print(f"\n{'='*60}")
    print(f"DRY RUN - Data to be imported")
    print(f"{'='*60}")
    print(f"\nUser: {user_name} (ID: {user_id})")
    print(f"Entries to import: {len(entries)}")
    print(f"\n{'Date':<12} {'Time':<8} {'Weight (kg)':<12} {'UTC Timestamp'}")
    print("-" * 60)

    for entry in entries:
        print(
            f"{entry['date']:<12} "
            f"{entry['time']:<8} "
            f"{entry['weight_kg']:<12.1f} "
            f"{entry['utc_timestamp']}"
        )

    print(f"\n{'='*60}")
    print("Run without --dry-run to import this data.")
    print(f"{'='*60}\n")


def import_entries(user_id: int, entries: list[dict], api_url: str):
    """Import entries via API."""
    success = 0
    failed = 0

    for entry in entries:
        try:
            response = requests.post(
                f"{api_url}/users/{user_id}/entries",
                json={
                    "timestamp": entry["utc_timestamp"],
                    "weight_kg": entry["weight_kg"],
                },
            )
            response.raise_for_status()
            success += 1
            print(f"✓ Row {entry['row']}: {entry['date']} {entry['time']} - {entry['weight_kg']} kg")
        except requests.RequestException as e:
            failed += 1
            print(f"✗ Row {entry['row']}: Failed - {e}", file=sys.stderr)

    print(f"\nImport complete: {success} succeeded, {failed} failed")


def main():
    args = parse_args()
    api_url = normalize_url(args.api_url)

    # Check file exists
    if not Path(args.file).exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    # Get user ID
    print(f"Looking up user '{args.user}'...")
    user_id = get_user_id(args.user, api_url)

    if user_id is None:
        print(f"Error: User '{args.user}' not found", file=sys.stderr)
        print("Create the user first in the web interface.", file=sys.stderr)
        sys.exit(1)

    print(f"Found user '{args.user}' with ID {user_id}")

    # Parse CSV
    print(f"Parsing {args.file}...")
    entries = parse_csv(args.file)
    print(f"Parsed {len(entries)} entries")

    if not entries:
        print("No entries to import.")
        return

    # Dry run or import
    if args.dry_run:
        print_dry_run(args.user, user_id, entries)
    else:
        print("\nImporting entries...")
        import_entries(user_id, entries, api_url)


if __name__ == "__main__":
    main()
