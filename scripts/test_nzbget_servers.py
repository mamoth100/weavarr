#!/usr/bin/env python3
"""Test connectivity for every configured NZBGet news server, by name only -
never prints credentials."""
import base64
import json
import urllib.request

NZBGET_URL = "http://localhost:6789/jsonrpc"
NZBGET_USER = "nzbget"
NZBGET_PASS = "s3ction11"


def rpc(method: str, params=None):
    body = json.dumps({"method": method, "params": params or []}).encode()
    req = urllib.request.Request(NZBGET_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    auth = base64.b64encode(f"{NZBGET_USER}:{NZBGET_PASS}".encode()).decode()
    req.add_header("Authorization", f"Basic {auth}")
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    if data.get("error"):
        raise RuntimeError(f"{method} failed: {data['error']}")
    return data["result"]


def main():
    config = rpc("config")
    by_name = {opt["Name"]: opt["Value"] for opt in config}

    indices = sorted({
        int(n[len("Server"):].split(".")[0])
        for n in by_name
        if n.startswith("Server") and "." in n and n[len("Server"):].split(".")[0].isdigit()
    })

    for i in indices:
        p = lambda suffix, default="": by_name.get(f"Server{i}.{suffix}", default)
        if p("Active") != "yes" or not p("Host"):
            continue
        name = p("Name") or p("Host")
        params = [
            p("Host"),
            int(p("Port", "119") or 119),
            p("Username"),
            p("Password"),
            p("JoinGroup", "no") == "yes",
            p("Encryption", "no") == "yes",
            p("Cipher"),
            p("CertVerification", "None"),
        ]
        try:
            result = rpc("testserver", params)
            print(f"{name}: {'OK' if result else 'FAILED'}")
        except Exception as e:
            print(f"{name}: ERROR ({e})")


if __name__ == "__main__":
    main()
