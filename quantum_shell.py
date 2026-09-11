#!/usr/bin/env python3
"""Small terminal client for the same API used by the website."""

import json
import os
import urllib.request

API = os.getenv("QUANTUM_API", "http://localhost:8000")


def post(path: str, body: dict) -> dict:
    request = urllib.request.Request(
        f"{API}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def main() -> None:
    user_id = input("User id: ").strip() or "local-user"
    print("Quantum shell. Ask a tutor question, or type :quit.")
    while True:
        message = input("you> ").strip()
        if message == ":quit":
            return
        if not message:
            continue
        try:
            result = post("/tutor", {"user_id": user_id, "message": message})
            print(f"granite> {result['answer']}\n")
        except Exception as error:
            print(f"error> {error}\n")


if __name__ == "__main__":
    main()
