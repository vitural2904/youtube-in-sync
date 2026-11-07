"""Build a reproducible unpacked-extension ZIP from an explicit file allowlist."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "manifest.json", "background.js", "content.js", "sync.js", "youtube.js",
    "popup.html", "popup.css", "popup.js",
)


def build():
    manifest = json.loads((ROOT / "extension/manifest.json").read_text(encoding="utf-8"))
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if manifest["version"] != package["version"]:
        raise ValueError("Package and extension versions differ")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"youtube-in-sync-v{package['version'].removesuffix('.0')}.zip"
    entries = [(name, ROOT / "extension" / name) for name in FILES]
    entries.append(("LICENSE", ROOT / "LICENSE"))
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, source in sorted(entries):
            if source.is_symlink() or not source.is_file():
                raise ValueError(f"Expected a regular release file: {name}")
            info = ZipInfo(name, date_time=(2026, 11, 7, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            # Normalize text so Windows and Linux source checkouts package identically.
            bundle.writestr(info, source.read_text(encoding="utf-8").replace("\r\n", "\n").encode("utf-8"))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Built {archive.name}: {archive.stat().st_size} bytes")
    print(f"SHA-256: {digest}")
    return archive


if __name__ == "__main__":
    build()
