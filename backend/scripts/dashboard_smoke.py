#!/usr/bin/env python3
"""Fetch dashboard stats/logs using a Firebase ID token."""

from __future__ import annotations

import argparse
import json
import sys

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dashboard API smoke tester")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000/api",
        help="Backend API base url (without trailing slash)",
    )
    parser.add_argument(
        "--id-token",
        required=True,
        help="Firebase ID token with 관리자 권한",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="최근 로그 조회 개수",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    headers = {"Authorization": f"Bearer {args.id_token}"}

    try:
        with httpx.Client(timeout=20.0) as client:
            stats_resp = client.get(f"{args.base_url}/dashboard/stats", headers=headers)
            stats_resp.raise_for_status()
            stats = stats_resp.json()

            logs_resp = client.get(
                f"{args.base_url}/dashboard/logs",
                params={"limit": args.limit},
                headers=headers,
            )
            logs_resp.raise_for_status()
            logs = logs_resp.json()
    except httpx.HTTPStatusError as exc:
        print(
            f"[ERROR] {exc.response.status_code} {exc.request.url} | "
            f"{exc.response.text or exc.response.reason_phrase}"
        )
        sys.exit(1)

    print("=== DASHBOARD STATS ===")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print("\n=== RECENT LOGS ===")
    if logs:
        for entry in logs:
            print(f"- [{entry.get('timestamp')}] {entry.get('question')}")
    else:
        print("No logs yet.")


if __name__ == "__main__":
    main()

