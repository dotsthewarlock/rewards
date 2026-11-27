#!/usr/bin/env python3
"""Explicit, two-phase Dev-only publication. No push, credentials or Stable promotion."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import unquote_to_bytes
import zipfile

REPO = "dotsthewarlock/rewards"
ROOT = "https://dotsthewarlock.github.io/rewards/"
BASE = "companion/launcher/"
STABLE = {"version":"15","path":"redeem/Redeem_Prepaid_Rewards_v15.js","sha256":"23bceac57b1d72ea1e8c452ae51ac665e0db1e8a967156be5b320ec6895d62b1"}
LIMIT = 20 * 1024 * 1024
BASELINE = "0033e6f0366d4850ae13d83bea8fb934ac6d99e5"
FROZEN = {BASE+"bootstrap.txt":"c4e0820eef012ee59d857926139c5ca5db65a9204821fb58a897f64c9d3ebd2c",
          STABLE["path"]:STABLE["sha256"],"redeem/Redeem_Prepaid_Rewards.js":STABLE["sha256"],
          "redeem/Redeem_Prepaid_Rewards_loader.txt":"55f463bc77c8dbb8b8a2b590fee814c7a05160f2ac0e983848be7ee752e82bb4"}

def require(condition, message):
    if not condition:
        raise ValueError(message)
def digest(data):
    return hashlib.sha256(data).hexdigest()
def load(data):
    return json.loads(data)
def json_bytes(obj):
    return (json.dumps(obj, indent=2) + "\n").encode()
def cmd(*args):
    return subprocess.check_output(args)
def git(*args):
    return cmd("git", *args).decode().strip()
def api(path):
    return cmd("gh", "api", "--method", "GET", "repos/"+REPO+"/"+path)

def check_run(run, artifact, commit, run_id):
    require(re.fullmatch(r"[a-f0-9]{40}", commit), "Exact candidate SHA required")
    require(run.get("id")==run_id and run.get("head_sha")==commit and
            run.get("head_branch")=="companion-dev" and run.get("event")=="push" and
            run.get("status")=="completed" and run.get("conclusion")=="success" and
            run.get("path")==".github/workflows/companion-browser.yml" and
            run.get("repository",{}).get("full_name")==REPO and
            run.get("head_repository",{}).get("full_name")==REPO, "Candidate CI gate failed")
    require(artifact.get("name")=="companion-development-"+commit and artifact.get("expired") is False and
            artifact.get("workflow_run",{}).get("id")==run_id and
            artifact.get("workflow_run",{}).get("head_sha")==commit and
            artifact.get("workflow_run",{}).get("head_branch")=="companion-dev" and
            re.fullmatch(r"sha256:[a-f0-9]{64}",artifact.get("digest","")) and
            0<artifact.get("size_in_bytes",0)<=LIMIT, "Exact non-expired artifact required")

def unpack(data, commit, outer):
    require(0<len(data)<=LIMIT and digest(data)==outer, "Artifact digest mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos=z.infolist()
        names=[i.filename for i in infos]
        require(len(names)==7 and len(set(names))==7 and sum(i.file_size for i in infos)<=LIMIT, "Unexpected archive contents")
        build=load(z.read("build.json"))
        require(build.get("schema")=="rewards.development-package/2" and build.get("channel")=="development" and
                build.get("status")=="development-only; not live accepted" and build.get("commit")==commit and
                build.get("rollbackBaseline")==BASELINE and
                re.fullmatch(r"\d+\.\d+\.\d+",build.get("version","")), "Invalid build metadata")
        version=build["version"]+"-dev-"+commit[:12]
        prefix="rewards-companion-"+version
        assets={"bookmarklet":prefix+"-bookmarklet.txt","source":prefix+"-bookmarklet.js","extension":prefix+"-extension.zip"}
        require(build.get("assets")==assets, "Versioned asset names do not match")
        expected=set(assets.values())|{"build.json","install.html","native-acceptance.md"}
        require(set(names)==expected|{"SHA256SUMS.txt"}, "Unexpected package member")
        sums={}
        for line in z.read("SHA256SUMS.txt").decode().splitlines():
            m=re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9._-]+)",line)
            require(m and m[2] not in sums, "Invalid checksums")
            sums[m[2]]=m[1]
        require(set(sums)==expected and all(digest(z.read(n))==sums[n] for n in expected), "Inner checksum mismatch")
        with zipfile.ZipFile(io.BytesIO(z.read(assets["extension"]))) as ext:
            members=ext.infolist()
            enames=[i.filename for i in members]
            require(len(enames)==len(set(enames)) and sum(i.file_size for i in members)<=LIMIT and
                    all(re.fullmatch(r"[A-Za-z0-9._/-]+", n) and
                        not any(part in ("",".","..") for part in n.split("/")) for n in enames),
                    "Unsafe or duplicate extension members")
            manifest=load(ext.read("manifest.json"))
            require(manifest.get("manifest_version")==3 and manifest.get("version")==build["version"] and
                    manifest.get("version_name")==build["version"]+" development candidate", "Extension metadata mismatch")
            runtime={"manifest.json",manifest["background"]["service_worker"],manifest["side_panel"]["default_path"],
                     *manifest["icons"].values(),*manifest["action"]["default_icon"].values(),
                     *(p for entry in manifest["content_scripts"] for p in entry["js"]),
                     "core/campaigns.js","core/codec.js","core/public-catalog.js","ui/components.js","ui/workspace.js",
                     "ui/views/workspace-queue.js","ui/views/workspace-rewards.js","ui/views/workspace-campaigns.js",
                     "ui/views/workspace-settings.js","ui/live.js","ui/tokens.css","ui/components.css"}
            require(set(enames)==runtime and ext.testzip() is None, "Unexpected extension runtime members")
        source=z.read(assets["source"])
        url=z.read(assets["bookmarklet"])
        require(url.startswith(b"javascript:") and url.endswith(b"\n") and
                unquote_to_bytes(url[11:-1].decode("ascii"))==source, "Bookmarklet URL/source mismatch")
    folder=BASE+"releases/"+version+"/"
    candidate={"version":version,"path":folder+assets["source"],"sha256":digest(source),
               "package":folder+prefix+"-development.zip","packageSha256":outer}
    return candidate,source

def manifest(repo):
    data=load((repo/(BASE+"channels.json")).read_bytes())
    require(data.get("schema")==1 and data.get("stable")==STABLE, "Stable freeze or schema changed")
    for path,expected in FROZEN.items():
        require(digest((repo/path).read_bytes())==expected, "Frozen artifact changed: "+path)
    verify_entry(data.get("dev",{}),"dev")
    return data

def checkout():
    repo=Path(git("rev-parse","--show-toplevel"))
    require(git("remote","get-url","origin") in
        ("https://github.com/"+REPO+".git","https://github.com/"+REPO,"git@github.com:"+REPO+".git"),
        "Wrong repository")
    require(not git("status","--porcelain"), "Use a clean isolated checkout")
    remote=git("ls-remote","origin","refs/heads/main").split()[0]
    require(git("rev-parse","HEAD")==remote, "Checkout must match current main")
    return repo

def forward(old, commit):
    require(re.fullmatch(r"[a-f0-9]{40}",commit), "Exact candidate SHA required")
    require(re.fullmatch(r"\d+\.\d+\.\d+-dev-[a-f0-9]{12}",old.get("version","")), "Invalid current Dev pointer")
    git("fetch","--no-tags","origin","companion-dev")
    git("merge-base","--is-ancestor",commit,"FETCH_HEAD")
    prior=git("rev-parse","--verify",old["version"].rsplit("-",1)[-1]+"^{commit}")
    git("merge-base","--is-ancestor",prior,commit)

def prepare(args):
    repo=checkout(); current=manifest(repo)
    require(0<len(args.checkpoint.strip())<=500, "Record the functional checkpoint and acceptance evidence")
    forward(current["dev"],args.commit)
    run=load(api("actions/runs/"+str(args.run)))
    artifacts=load(api("actions/runs/"+str(args.run)+"/artifacts?per_page=100"))["artifacts"]
    matches=[a for a in artifacts if a.get("name")=="companion-development-"+args.commit]
    require(len(matches)==1,"Expected exactly one candidate artifact")
    artifact=matches[0];check_run(run,artifact,args.commit,args.run)
    data=api("actions/artifacts/"+str(artifact["id"])+"/zip")
    candidate,source=unpack(data,args.commit,artifact["digest"].split(":")[1])
    require(candidate["version"]!=current["dev"]["version"] or candidate["sha256"]==current["dev"]["sha256"],
            "Same-version publication must preserve exact source")
    folder=(repo/candidate["path"]).parent
    require(not folder.exists(), "Immutable version directory already exists; never overwrite")
    evidence={"schema":1,"commit":args.commit,"run":args.run,"artifact":artifact["id"],
              "checkpoint":args.checkpoint,"candidate":candidate,"previousDev":current["dev"]}
    with tempfile.TemporaryDirectory(dir=folder.parent) as tmp:
        stage=Path(tmp)/"new";stage.mkdir()
        (stage/Path(candidate["path"]).name).write_bytes(source)
        (stage/Path(candidate["package"]).name).write_bytes(data)
        (stage/"publication.json").write_bytes(json_bytes(evidence))
        stage.rename(folder)
    print("Prepared immutable Dev files only:",folder)
    print("Commit and fast-forward push these files; verify hosted bytes before activate. channels.json unchanged.")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

def hosted(path, expected):
    require(re.fullmatch(r"[A-Za-z0-9._/-]+",path) and ".." not in path.split("/") and not path.startswith("/"), "Invalid hosted path")
    request=urllib.request.Request(ROOT+path,headers={"Cache-Control":"no-cache","Accept-Encoding":"identity"})
    with urllib.request.build_opener(NoRedirect()).open(request,timeout=15) as response:
        data=response.read(LIMIT+1)
    require(len(data)<=LIMIT and digest(data)==expected,"Hosted bytes mismatch: "+path)

def activate(args):
    repo=checkout();current=manifest(repo)
    require(re.fullmatch(r"\d+\.\d+\.\d+-dev-[a-f0-9]{12}",args.version),"Invalid Dev version")
    folder=repo/(BASE+"releases/"+args.version)
    evidence=load((folder/"publication.json").read_bytes())
    require(evidence.get("schema")==1 and evidence["previousDev"]==current["dev"],"Dev pointer changed since preparation")
    c=evidence["candidate"];require(c["version"]==args.version,"Version mismatch")
    commit=evidence["commit"];forward(current["dev"],commit)
    artifact=load(api("actions/artifacts/"+str(evidence["artifact"])))
    check_run(load(api("actions/runs/"+str(evidence["run"]))),artifact,commit,evidence["run"])
    expected,source=unpack((folder/("rewards-companion-"+args.version+"-development.zip")).read_bytes(),commit,artifact["digest"].split(":")[1])
    require(c==expected and (repo/c["path"]).read_bytes()==source,"Prepared files or evidence changed")
    require(c["version"]!=current["dev"]["version"] or c["sha256"]==current["dev"]["sha256"],
            "Same-version publication must preserve exact source")
    for path,expected in FROZEN.items():hosted(path,expected)
    hosted(BASE+"channels.json",digest((repo/(BASE+"channels.json")).read_bytes()))
    previous=current["dev"]
    hosted(previous["path"],previous["sha256"])
    if previous.get("package"):hosted(previous["package"],previous["packageSha256"])
    hosted(c["path"],c["sha256"]);hosted(c["package"],c["packageSha256"])
    hosted(str((folder/"publication.json").relative_to(repo)),digest((folder/"publication.json").read_bytes()))
    current["dev"]=c
    target=repo/(BASE+"channels.json")
    tmp=target.with_suffix(".tmp")
    tmp.write_bytes(json_bytes(current));tmp.replace(target)
    print("Dev pointer prepared. Commit only channels.json and fast-forward push; then verify hosted bytes.")

def verify_entry(c, grade):
    require(re.fullmatch(r"\d+\.\d+\.\d+-"+grade+r"-[a-f0-9]{12}",c.get("version","")), "Invalid channel version")
    version=c["version"];folder=BASE+"releases/"+version+"/"
    require(c.get("path") in (BASE+"releases/"+version+".js",folder+"rewards-companion-"+version+"-bookmarklet.js") and
            re.fullmatch(r"[a-f0-9]{64}",c.get("sha256","")), "Invalid channel artifact")
    if "package" in c or "packageSha256" in c:
        require(c.get("package")==folder+"rewards-companion-"+version+"-development.zip" and
                re.fullmatch(r"[a-f0-9]{64}",c.get("packageSha256","")), "Invalid development package")
    if grade=="test":
        require(c.get("mode")=="read-only" and isinstance(c.get("purpose"),str) and 0<len(c["purpose"].strip())<=120, "Invalid Test metadata")

def verify(repo,wait):
    current=manifest(repo)
    paths=[BASE+"bootstrap.txt",BASE+"loader.js",BASE+"channels.json",STABLE["path"],
           "redeem/Redeem_Prepaid_Rewards.js","redeem/Redeem_Prepaid_Rewards_loader.txt"]
    for name in ("dev","test"):
        c=current.get(name)
        if not c:continue
        verify_entry(c,name)
        require(c["path"].startswith(BASE+"releases/") and digest((repo/c["path"]).read_bytes())==c["sha256"],"Channel artifact mismatch")
        paths.append(c["path"])
        if c.get("package"):
            require(c["package"].startswith(BASE+"releases/") and digest((repo/c["package"]).read_bytes())==c["packageSha256"],"Package mismatch")
            paths.append(c["package"])
    # A package-bearing pointer must have an exact immutable provenance record.
    if current["dev"].get("package"):
        active_record=repo/(BASE+"releases/"+current["dev"]["version"]+"/publication.json")
        require(load(active_record.read_bytes())["candidate"]==current["dev"],"Active pointer/provenance mismatch")
    # Also verify staged immutable assets before their pointer is active.
    for record in sorted((repo/(BASE+"releases")).glob("*/publication.json")):
        evidence=load(record.read_bytes());c=evidence["candidate"]
        verify_entry(c,"dev")
        require(evidence.get("schema")==1 and record.parent.name==c["version"] and
                re.fullmatch(r"[a-f0-9]{40}",evidence.get("commit","")) and
                c["version"].endswith("-"+evidence["commit"][:12]),"Invalid publication evidence")
        expected,source=unpack((repo/c["package"]).read_bytes(),evidence["commit"],c["packageSha256"])
        require(expected==c and (repo/c["path"]).read_bytes()==source,"Prepared immutable artifact mismatch")
        paths.extend([c["path"],c["package"],str(record.relative_to(repo))])
        previous=evidence["previousDev"];verify_entry(previous,"dev")
        require(digest((repo/previous["path"]).read_bytes())==previous["sha256"],"Rollback source mismatch")
        paths.append(previous["path"])
        if previous.get("package"):
            require(digest((repo/previous["package"]).read_bytes())==previous["packageSha256"],"Rollback package mismatch")
            paths.append(previous["package"])
    paths=list(dict.fromkeys(paths))
    expires=time.monotonic()+wait
    for attempt in range(100):
        try:
            for path in paths:
                expected=digest((repo/path).read_bytes());hosted(path,expected)
                print("Hosted SHA256",expected,path,flush=True)
            return
        except (OSError,ValueError) as err:
            if time.monotonic()>=expires:raise
            print("Awaiting Pages publication:",err,flush=True);time.sleep(10)
    raise ValueError("Hosted verification exhausted")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest="action",required=True)
    p=sub.add_parser("prepare");p.add_argument("--commit",required=True);p.add_argument("--run",required=True,type=int);p.add_argument("--checkpoint",required=True)
    p=sub.add_parser("activate");p.add_argument("--version",required=True)
    p=sub.add_parser("verify");p.add_argument("--wait",type=int,default=0)
    args=parser.parse_args()
    if args.action=="prepare":prepare(args)
    elif args.action=="activate":activate(args)
    else:verify(Path(git("rev-parse","--show-toplevel")),max(0,min(args.wait,300)))
if __name__=="__main__":main()
