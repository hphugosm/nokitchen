"""Package the source tree and its built standalone, using the standard library."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="destination ZIP file")
parser.add_argument("--pages", type=Path, help="also create a ZIP of the checked public distribution")
args = parser.parse_args()

entries = {
    name: root / name
    for name in (
        ".gitignore", ".env.example", "README.md", "index.html", "package.json", "package-lock.json",
        "tsconfig.json", "vite.config.ts",
    )
}
entries["NoKitchen-1.4.1.html"] = root / "dist" / "NoKitchen-1.4.1.html"
entries[".github/workflows/pages.yml"] = root / ".github/workflows/pages.yml"
for folder, extensions in {
    "server": {".ts"},
    "src": {".ts", ".tsx", ".css", ".woff2", ".txt"},
    "docs": {".md", ".json"},
    "tests": {".ts", ".mjs"},
    "scripts": {".mjs", ".py"},
}.items():
    for path in (root / folder).rglob("*"):
        relative = path.relative_to(root)
        if path.is_symlink() or any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
            continue
        if path.is_file() and path.suffix in extensions:
            entries[relative.as_posix()] = path

for path in entries.values():
    if not path.is_file():
        parser.error(f"Missing {path.name}. Build the project before packaging.")
with ZipFile(args.archive, "w") as archive:
    for name, source in sorted(entries.items()):
        info = ZipInfo("NoKitchen/" + name)
        info.external_attr = 0o100644 << 16
        archive.writestr(info, source.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
print(f"{args.archive} ({len(entries)} files)")


if args.pages:
    import subprocess

    subprocess.run(["node", "scripts/check-public.mjs"], cwd=root, check=True)
    build = root / "dist"
    with ZipFile(args.pages, "w") as archive:
        for path in sorted(build.rglob("*")):
            if path.is_file():
                info = ZipInfo(path.relative_to(build).as_posix())
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    print(f"{args.pages} (static Pages distribution)")
