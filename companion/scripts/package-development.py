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
# D2 approved homepage discovery is the sole protected-tree difference.
homepage_baseline="f9d3ee61616a3680b3cb3083bd9501b4c92e8793"
assert git("rev-parse","HEAD:index.html")==git("rev-parse",homepage_baseline+":index.html"),"approved homepage differs"
assert [p for p in protected("HEAD") if not p.endswith(b"\tindex.html")]==[p for p in protected(baseline) if not p.endswith(b"\tindex.html")],"production/rollback tree differs"
manifest=json.loads((src/"manifest.json").read_text())
files={"manifest.json",manifest["background"]["service_worker"],manifest["side_panel"]["default_path"],
       *manifest["icons"].values(),*manifest["action"]["default_icon"].values(),
       *(p for entry in manifest["content_scripts"] for p in entry["js"]),
       "core/campaigns.js","core/codec.js","core/public-catalog.js","ui/components.js","ui/workspace.js",
       "ui/views/workspace-queue.js","ui/views/workspace-rewards.js","ui/views/workspace-campaigns.js","ui/views/workspace-settings.js",
       "ui/live.js","ui/tokens.css","ui/components.css"}
version=manifest["version"]
commit=git("rev-parse","HEAD").decode().strip()
subprocess.check_call(["git","diff","--quiet","HEAD","--"],cwd=repo)
panel=manifest["side_panel"]["default_path"]
source_marker='data-build-version="" data-build-commit=""'
identity=f'data-build-version="{version}" data-build-commit="{commit}"'
assert (src/panel).read_text().count(source_marker)==1
def runtime_bytes(name):
    raw=(src/name).read_bytes()
    return raw.replace(source_marker.encode(),identity.encode()) if name==panel else raw
def archive():
    buf=io.BytesIO()
    with ZipFile(buf,"w",compression=ZIP_STORED) as z:
        for name in sorted(files):
            entry=ZipInfo(name,date_time=(1980,1,1,0,0,0))
            entry.create_system=3
            entry.external_attr=0o100644<<16
            z.writestr(entry,runtime_bytes(name))
    return buf.getvalue()
prefix=f"rewards-companion-{version}-dev-{commit[:12]}"
asset_names={"extension":prefix+"-extension.zip","bookmarklet":prefix+"-bookmarklet.txt","source":prefix+"-bookmarklet.js"}
assert manifest["version_name"]==f"{version} development candidate"
assert all(not name.startswith("sandbox/") and name not in {"prototype.html","sandbox.html","core/model.js","core/contracts.js","core/presentation.js","ui/app.js"} for name in files)
data=archive()
assert data==archive(),"archive not deterministic"
for directory in (out,extracted):
    if directory.exists(): shutil.rmtree(directory)
    directory.mkdir(parents=True)
(out/asset_names["extension"]).write_bytes(data)
with ZipFile(io.BytesIO(data)) as z:
    assert set(z.namelist())==files and z.testzip() is None
    z.extractall(extracted)
for name in files:
    assert (extracted/name).read_bytes()==runtime_bytes(name)
for name,role in (("bookmarklet.txt","bookmarklet"),("bookmarklet.js","source")):
    shutil.copyfile(build/name,out/asset_names[role])
    assert b"fixtureCode" not in (out/asset_names[role]).read_bytes()
    assert b"function makeSandbox" not in (out/asset_names[role]).read_bytes()
# Both distributions must carry exactly the same generated public identity.
assert identity.encode() in (extracted/panel).read_bytes()
assert json.dumps(identity)[1:-1].encode() in (out/asset_names["source"]).read_bytes()
shutil.copyfile(base/"docs/native-acceptance.md",out/"native-acceptance.md")
metadata={"schema":"rewards.development-package/2","version":version,"channel":"development",
          "commit":commit,"rollbackBaseline":baseline,"assets":asset_names,
          "status":"development-only; not live accepted"}
install=(base/"docs/install-development.html").read_text()
for name,value in {"VERSION":version,"COMMIT":commit,"EXTENSION":asset_names["extension"],"BOOKMARKLET":asset_names["bookmarklet"],"SOURCE":asset_names["source"]}.items():
    install=install.replace("@"+name+"@",value)
assert "@"+"VERSION"+"@" not in install
(out/"install.html").write_text(install)
(out/"build.json").write_text(json.dumps(metadata,sort_keys=True,indent=2)+"\n")
(out/"SHA256SUMS.txt").write_text("".join(f"{sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in sorted(out.iterdir())))
print("Deterministic versioned development assets, exact extracted runtime bytes, protected rollback tree, synthetic exclusion PASS")
