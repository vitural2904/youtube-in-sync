import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("packager", ROOT / "scripts/package-extension.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackageTests(unittest.TestCase):
    def test_allowlist_excludes_local_files_and_build_is_repeatable(self):
        # Copy only public inputs into an isolated fixture. A secret deliberately added to
        # the extension directory must never be included by recursive packaging.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "extension").mkdir()
            for name in packager.FILES:
                (root / "extension" / name).write_bytes((ROOT / "extension" / name).read_bytes())
            for name in ["LICENSE", "package.json"]:
                (root / name).write_bytes((ROOT / name).read_bytes())
            (root / "extension/.env").write_text("PRIVATE_TEST_FIXTURE=never-package")
            with patch.object(packager, "ROOT", root):
                archive = packager.build()
                first = archive.read_bytes()
                packager.build()
                self.assertEqual(first, archive.read_bytes())
                with ZipFile(archive) as bundle:
                    self.assertEqual(set(bundle.namelist()), set(packager.FILES) | {"LICENSE"})
                    self.assertIsNone(bundle.testzip())
                    self.assertNotIn(b"PRIVATE_TEST_FIXTURE", b"".join(bundle.read(n) for n in bundle.namelist()))


if __name__ == "__main__":
    unittest.main()
