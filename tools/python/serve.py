"""Serve host-approved, byte-pinned precompiled files; never compile on requests."""

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import stat
from urllib.parse import unquote, urlsplit

from publisle import ConsumerError, digest, fail, object_shape, parse_json

MEDIA_TYPES = {"text/html; charset=utf-8", "text/css; charset=utf-8", "text/javascript; charset=utf-8",
               "application/json", "image/png", "image/jpeg", "image/svg+xml", "image/webp", "font/woff2"}


def read_regular(root_fd, name, maximum):
    """Descriptor-relative no-follow traversal, including every parent directory."""
    if type(name) is not str or not re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", name):
        fail("unsafe-asset-path", "Invalid asset path")
    parts = name.split("/")
    if any(part in (".", "..") for part in parts):
        fail("unsafe-asset-path", "Traversal is forbidden")
    parent = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            os.close(parent)
            parent = child
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
                fail("unsafe-asset-file", "Asset must be bounded regular file, without hardlinks")
            data = stream.read(maximum + 1)
            if len(data) > maximum:
                fail("asset-size-limit", "Asset exceeds byte limit")
            return data
    finally:
        os.close(parent)


def load_site(directory, expected_digest):
    """All bytes verified/cached once; request handling cannot access source files."""
    root_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        manifest = parse_json(read_regular(root_fd, "site.json", 2 * 1024 * 1024))
        if digest(manifest) != expected_digest:
            fail("site-integrity-mismatch", "Host manifest pin mismatch")
        object_shape(manifest, ("profile", "entry", "files"))
        if manifest["profile"] != "urn:publisle:host-site:beta":
            fail("unsupported-contract", "Unsupported host site profile")
        files = manifest["files"]
        if type(files) is not list or not 1 <= len(files) <= 256:
            fail("asset-count-limit", "Site file count exceeds limits")
        assets, total = {}, 0
        for file in files:
            object_shape(file, ("path", "digest", "mediaType"))
            name = file["path"]
            if type(name) is not str or name in assets or name == "site.json":
                fail("invalid-contract", "Duplicate or reserved asset path")
            if type(file["mediaType"]) is not str or file["mediaType"] not in MEDIA_TYPES:
                fail("unsupported-media-type", "Host media type not approved")
            content = read_regular(root_fd, name, 64 * 1024 * 1024)
            total += len(content)
            if total > 128 * 1024 * 1024:
                fail("asset-size-limit", "Site exceeds total byte budget")
            actual = "sha256:" + hashlib.sha256(content).hexdigest()
            if actual != file["digest"]:
                fail("asset-integrity-mismatch", "Asset digest mismatch: " + name)
            assets[name] = (content, file["mediaType"], actual)
        if type(manifest["entry"]) is not str or manifest["entry"] not in assets or assets[manifest["entry"]][1] != "text/html; charset=utf-8":
            fail("invalid-contract", "Missing host HTML entry")
        return manifest["entry"], assets
    finally:
        os.close(root_fd)


def create_server(directory, expected_digest, port=0):
    entry, assets = load_site(directory, expected_digest)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.respond(False)

        def do_HEAD(self):
            self.respond(True)

        def respond(self, head):
            try:
                path = unquote(urlsplit(self.path).path, errors="strict")
            except (ValueError, UnicodeError):
                self.send_error(400)
                return
            name = entry if path == "/" else path.removeprefix("/")
            asset = assets.get(name)
            if asset is None:
                self.send_error(404)
                return
            content, media_type, pin = asset
            self.send_response(200)
            self.send_header("Content-Type", media_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'")
            self.send_header("ETag", '"' + pin + '"')
            self.end_headers()
            if not head:
                self.wfile.write(content)

        def log_message(self, _format, *_args):
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--digest", required=True, help="Out-of-band host-approved site manifest JCS digest")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    try:
        server = create_server(args.directory, args.digest, args.port)
    except (ConsumerError, OSError) as error:
        parser.exit(1, f"{getattr(error, 'code', 'io-error')}: {error}\n")
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
