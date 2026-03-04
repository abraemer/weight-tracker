#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
Delete a user from the weight tracker.

Usage:
    uv run scripts/delete_user.py --user "Alice" [--api-url URL]

If multiple users have the same name, you'll be shown a list to choose from.
"""

import argparse
import sys

import requests


def parse_args():
    parser = argparse.ArgumentParser(
        description="Delete a user from the weight tracker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run scripts/delete_user.py --user "Alice"
  uv run scripts/delete_user.py --user "Bob" --api-url "http://localhost:3000/api"
""",
    )
    parser.add_argument("--user", required=True, help="User name to delete")
    parser.add_argument(
        "--api-url",
        default="http://localhost:3000/api",
        help="API URL (default: http://localhost:3000/api)",
    )
    return parser.parse_args()


def get_users(api_url: str) -> list[dict]:
    """Fetch all users from API."""
    response = requests.get(f"{api_url}/users")
    response.raise_for_status()
    return response.json()


def delete_user(user_id: int, api_url: str) -> bool:
    """Delete a user by ID. Returns True on success."""
    response = requests.delete(f"{api_url}/users/{user_id}")
    if response.status_code == 204:
        return True
    return False


def format_datetime(iso_str: str) -> str:
    """Format ISO datetime to readable string."""
    # Remove 'Z' suffix if present and parse
    iso_clean = iso_str.rstrip("Z")
    try:
        from datetime import datetime

        dt = datetime.fromisoformat(iso_clean)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso_str


def main():
    args = parse_args()

    print(f"Looking up user '{args.user}'...")

    try:
        users = get_users(args.api_url)
    except requests.RequestException as e:
        print(f"Error: Could not connect to API at {args.api_url}", file=sys.stderr)
        print(f"Details: {e}", file=sys.stderr)
        sys.exit(1)

    # Find matching users
    matching = [u for u in users if u["name"] == args.user]

    if not matching:
        print(f"User '{args.user}' not found.")
        print("\nAvailable users:")
        for u in users:
            created = format_datetime(u.get("created_at", "unknown"))
            print(f"  - {u['name']} (ID: {u['id']}, created: {created})")
        sys.exit(1)

    if len(matching) == 1:
        user = matching[0]
        user_id = user["id"]
        created = format_datetime(user.get("created_at", "unknown"))
        print(f"Found user: {user['name']} (ID: {user_id}, created: {created})")
    else:
        # Multiple users with same name - let user choose
        print(f"Found {len(matching)} users named '{args.user}':")
        print()
        for i, u in enumerate(matching, 1):
            created = format_datetime(u.get("created_at", "unknown"))
            print(f"  {i}. ID: {u['id']}, created: {created}")
        print()

        while True:
            try:
                choice = input("Enter number to delete (or 'q' to quit): ").strip()
                if choice.lower() == "q":
                    print("Cancelled.")
                    sys.exit(0)
                choice_num = int(choice)
                if 1 <= choice_num <= len(matching):
                    user = matching[choice_num - 1]
                    user_id = user["id"]
                    break
                else:
                    print(f"Please enter a number between 1 and {len(matching)}")
            except ValueError:
                print("Invalid input. Enter a number or 'q' to quit.")
            except KeyboardInterrupt:
                print("\nCancelled.")
                sys.exit(0)

    # Confirmation
    print()
    print(f"WARNING: This will delete user '{user['name']}' and ALL their weight entries!")
    confirm = input("Type 'yes' to confirm: ").strip()

    if confirm.lower() != "yes":
        print("Cancelled.")
        sys.exit(0)

    # Delete
    print(f"\nDeleting user '{user['name']}' (ID: {user_id})...")

    if delete_user(user_id, args.api_url):
        print(f"✓ User '{user['name']}' deleted successfully.")
    else:
        print(f"✗ Failed to delete user.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
