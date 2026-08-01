#!/usr/bin/env python3
"""One-time migration of SABnzbd's news server config into NZBGet.

Run directly on the Pi (reads sabnzbd.ini and calls NZBGet's JSON-RPC API
locally) so Usenet credentials never leave the box. Safe to re-run: it
replaces any NZBGet Server1..N entries with a fresh set derived from SAB.
"""
import json
import re
import urllib.request

SAB_INI = "/data/config/sabnzbd/sabnzbd.ini"
NZBGET_URL = "http://localhost:6789/jsonrpc"
NZBGET_USER = "nzbget"
NZBGET_PASS = "s3ction11"

# SAB's incomplete/complete dirs - NZBGet's docker-compose mounts the same
# /data volume, so pointing NZBGet at the identical paths keeps Radarr/Sonarr
# (and anything else that expects files under /data) working unchanged.
SAB_INCOMPLETE = "/data/incomplete"
SAB_COMPLETE = "/data/complete"


def sab_ssl_verify_to_nzbget(ssl_verify: str) -> str:
    v = (ssl_verify or "").strip()
    if v == "3":
        return "Strict"
    if v == "2":
        return "Minimal"
    return "None"


def rpc(method: str, params=None):
    body = json.dumps({"method": method, "params": params or []}).encode()
    req = urllib.request.Request(NZBGET_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    import base64
    auth = base64.b64encode(f"{NZBGET_USER}:{NZBGET_PASS}".encode()).decode()
    req.add_header("Authorization", f"Basic {auth}")
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    if "error" in data and data["error"]:
        raise RuntimeError(f"{method} failed: {data['error']}")
    return data["result"]


def parse_sab_servers(path: str):
    """SABnzbd's ini uses configobj-style nested sections ([[name]] under
    [servers]), which the stdlib configparser cannot read at all - walk it
    by hand instead, tracking section depth via bracket count."""
    header_re = re.compile(r"^(\[+)([^\[\]]+)(\]+)$")
    section_path: list[str] = []
    blocks: dict[str, dict[str, str]] = {}

    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith(";"):
                continue
            m = header_re.match(line)
            if m:
                depth = len(m.group(1))
                name = m.group(2)
                section_path = section_path[: depth - 1] + [name]
                if depth == 2 and section_path[0] == "servers":
                    blocks[name] = {}
                continue
            if "=" not in line:
                continue
            if len(section_path) == 2 and section_path[0] == "servers":
                key, _, value = line.partition("=")
                blocks[section_path[1]][key.strip()] = value.strip().strip('"')

    return blocks


def main():
    blocks = parse_sab_servers(SAB_INI)

    servers = []
    for name, s in blocks.items():
        if s.get("enable", "1") != "1":
            continue
        servers.append({
            "name": name,
            "host": s.get("host", ""),
            "port": s.get("port", "563"),
            "username": s.get("username", ""),
            "password": s.get("password", ""),
            "connections": s.get("connections", "8"),
            "ssl": s.get("ssl", "0") == "1",
            "cert": sab_ssl_verify_to_nzbget(s.get("ssl_verify", "0")),
            # SAB: lower number = higher priority. NZBGet: lower Level = higher priority.
            # Both scales start at 0, so map directly, clamped to NZBGet's 0-99 range.
            "level": max(0, min(99, int(s.get("priority", "0")))),
        })

    if not servers:
        raise SystemExit("No enabled servers found in sabnzbd.ini - check the [servers] section name/parsing.")

    print(f"Found {len(servers)} enabled server(s) in SABnzbd:")
    for s in servers:
        print(f"  - {s['name']} ({s['host']}:{s['port']}, level={s['level']}, connections={s['connections']}, ssl={s['ssl']})")

    # These come back from the "config" RPC method but are read-only/computed
    # - writing them back via "saveconfig" produces "Invalid option" errors on
    # every subsequent startup.
    READ_ONLY = {"ConfigFile", "AppBin", "AppDir", "Version"}

    config = [opt for opt in rpc("config") if opt["Name"] not in READ_ONLY]
    by_name = {opt["Name"]: opt for opt in config}

    def set_opt(name: str, value: str):
        if name in by_name:
            by_name[name]["Value"] = str(value)
        else:
            new_opt = {"Name": name, "Value": str(value)}
            config.append(new_opt)
            by_name[name] = new_opt

    # Clear out any pre-existing ServerN.* entries beyond what we're about to
    # write, so a re-run doesn't leave stale servers behind.
    existing_server_indices = set()
    for opt in config:
        if opt["Name"].startswith("Server") and "." in opt["Name"]:
            idx = opt["Name"][len("Server"):].split(".")[0]
            if idx.isdigit():
                existing_server_indices.add(int(idx))
    for idx in existing_server_indices:
        if idx > len(servers):
            for suffix in ["Active", "Name", "Level", "Optional", "Group", "Host", "Encryption",
                           "Port", "Username", "Password", "JoinGroup", "Cipher", "Connections",
                           "Retention", "CertVerification", "IpVersion", "Notes"]:
                set_opt(f"Server{idx}.{suffix}", "")
            set_opt(f"Server{idx}.Active", "no")

    for i, s in enumerate(servers, start=1):
        set_opt(f"Server{i}.Active", "yes")
        set_opt(f"Server{i}.Name", s["name"])
        set_opt(f"Server{i}.Level", s["level"])
        set_opt(f"Server{i}.Optional", "no")
        set_opt(f"Server{i}.Group", 0)
        set_opt(f"Server{i}.Host", s["host"])
        set_opt(f"Server{i}.Encryption", "yes" if s["ssl"] else "no")
        set_opt(f"Server{i}.Port", s["port"])
        set_opt(f"Server{i}.Username", s["username"])
        set_opt(f"Server{i}.Password", s["password"])
        set_opt(f"Server{i}.JoinGroup", "no")
        set_opt(f"Server{i}.Cipher", "")
        set_opt(f"Server{i}.Connections", s["connections"])
        set_opt(f"Server{i}.Retention", 0)
        set_opt(f"Server{i}.CertVerification", s["cert"])
        set_opt(f"Server{i}.IpVersion", "auto")
        set_opt(f"Server{i}.Notes", "")

    # Point NZBGet at the same incomplete/complete directories SAB used, so
    # downloads land where Radarr/Sonarr's root folders already expect them.
    set_opt("InterDir", SAB_INCOMPLETE)
    set_opt("DestDir", SAB_COMPLETE)

    result = rpc("saveconfig", [config])
    print(f"saveconfig result: {result}")
    print("Reloading NZBGet to apply...")
    print(rpc("reload"))


if __name__ == "__main__":
    main()
