"""Deterministic development-only packaging; no release or production mutation."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED
from hashlib import sha256
import json
import shutil
import subprocess
import io

base=Path(__file__).resolve().parents[1]
repo=base.parent
src=base/"extension"
build=base/".build"
out=build/"development"
extracted=build/"packaged-extension"
baseline="0033e6f0366d4850ae13d83bea8fb934ac6d99e5"
def git(*args):
    return subprocess.check_output(["git",*args],cwd=repo)
def protected(ref):
    return [line for line in git("ls-tree","-r",ref).splitlines()
            if not line.split(b"\t",1)[1].startswith((b"companion/",b"companion-preview/",b".github/"))]
assert protected("HEAD")==protected(baseline),"production/rollback tree differs"
manifest=json.loads((src/"manifest.json").read_text())
files={"manifest.json",manifest["background"]["service_worker"],manifest["side_panel"]["default_path"],
       *manifest["icons"].values(),*manifest["action"]["default_icon"].values(),
       *(p for entry in manifest["content_scripts"] for p in entry["js"]),
       "core/campaigns.js","core/codec.js","core/public-catalog.js","ui/components.js","ui/workspace.js",
       "ui/views/workspace-queue.js","ui/views/workspace-rewards.js","ui/views/workspace-campaigns.js","ui/views/workspace-settings.js",
       "ui/live.js","ui/tokens.css","ui/components.css"}
def archive():
    buf=io.BytesIO()
    with ZipFile(buf,"w",compression=ZIP_STORED) as z:
        for name in sorted(files):
            entry=ZipInfo(name,date_time=(1980,1,1,0,0,0))
            entry.create_system=3
            entry.external_attr=0o100644<<16
            z.writestr(entry,(src/name).read_bytes())
    return buf.getvalue()
data=archive()
assert data==archive(),"archive not deterministic"
for directory in (out,extracted):
    if directory.exists(): shutil.rmtree(directory)
    directory.mkdir(parents=True)
(out/"extension-development.zip").write_bytes(data)
with ZipFile(io.BytesIO(data)) as z:
    assert set(z.namelist())==files and z.testzip() is None
    z.extractall(extracted)
for name in files:
    assert (extracted/name).read_bytes()==(src/name).read_bytes()
for name in ("bookmarklet.txt","bookmarklet.js"):
    shutil.copyfile(build/name,out/name)
shutil.copyfile(base/"docs/native-acceptance.md",out/"native-acceptance.md")
metadata={"schema":"rewards.development-package/1","version":manifest["version"],
          "commit":git("rev-parse","HEAD").decode().strip(),"rollbackBaseline":baseline,
          "status":"development-only; not live accepted"}
(out/"build.json").write_text(json.dumps(metadata,sort_keys=True,indent=2)+"\n")
(out/"SHA256SUMS.txt").write_text("".join(f"{sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in sorted(out.iterdir())))
print("Deterministic development ZIP, exact extracted runtime bytes, protected rollback tree PASS")
