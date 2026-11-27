"""Deterministic Dev publication gates; never push or contact a merchant."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile
from urllib.parse import quote

spec=importlib.util.spec_from_file_location("publication",Path(__file__).resolve().parents[1]/"launcher/tools/publication.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
COMMIT="a"*40
RUN=42
PREFIX="rewards-companion-0.6.1-dev-"+COMMIT[:12]
ASSETS={"bookmarklet":PREFIX+"-bookmarklet.txt","source":PREFIX+"-bookmarklet.js","extension":PREFIX+"-extension.zip"}

def archive(files):
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w") as z:
        for key,value in files.items():z.writestr(key,value)
    return buf.getvalue()
def fixture():
    build={"schema":"rewards.development-package/2","channel":"development","status":"development-only; not live accepted","commit":COMMIT,"version":"0.6.1","rollbackBaseline":m.BASELINE,"assets":ASSETS}
    source=b"window.fixture=true;"
    manifest={"manifest_version":3,"version":"0.6.1","version_name":"0.6.1 development candidate",
              "background":{"service_worker":"background.js"},"side_panel":{"default_path":"index.html"},
              "icons":{"16":"icons/icon16.png"},"action":{"default_icon":{"16":"icons/icon16.png"}},
              "content_scripts":[{"js":["discovery/content.js"]}]}
    runtime={"background.js","index.html","icons/icon16.png","discovery/content.js",
             "core/campaigns.js","core/codec.js","core/public-catalog.js","ui/components.js","ui/workspace.js",
             "ui/views/workspace-queue.js","ui/views/workspace-rewards.js","ui/views/workspace-campaigns.js",
             "ui/views/workspace-settings.js","ui/live.js","ui/tokens.css","ui/components.css"}
    ext={n:b"fixture" for n in runtime};ext["manifest.json"]=m.json_bytes(manifest)
    files={"build.json":m.json_bytes(build),"install.html":b"fixture","native-acceptance.md":b"fixture",
           ASSETS["bookmarklet"]:("javascript:"+quote(source.decode(),safe="")+"\n").encode(),ASSETS["source"]:source,
           ASSETS["extension"]:archive(ext)}
    files["SHA256SUMS.txt"]="".join(m.digest(v)+"  "+k+"\n" for k,v in files.items()).encode()
    data=archive(files)
    run={"id":RUN,"head_sha":COMMIT,"head_branch":"companion-dev","event":"push","status":"completed","conclusion":"success","path":".github/workflows/companion-browser.yml","repository":{"full_name":m.REPO},"head_repository":{"full_name":m.REPO}}
    art={"id":43,"name":"companion-development-"+COMMIT,"expired":False,"workflow_run":{"id":RUN,"head_sha":COMMIT,"head_branch":"companion-dev"},"size_in_bytes":len(data),"digest":"sha256:"+m.digest(data)}
    return data,run,art,files

class PublicationTests(unittest.TestCase):
    def test_exact_run(self):
        data,run,art,_=fixture()
        m.check_run(run,art,COMMIT,RUN)
        for bad in ({"conclusion":"failure"},{"head_branch":"main"},{"head_sha":"b"*40},{"event":"pull_request"},{"path":"other.yml"},{"head_repository":{"full_name":"fork/rewards"}}):
            with self.assertRaises(ValueError):m.check_run({**run,**bad},art,COMMIT,RUN)
        for bad in ({"expired":True},{"digest":""},{"name":"wrong"},{"size_in_bytes":m.LIMIT+1},{"id":True},{"id":0},{"id":"43"}):
            with self.assertRaises(ValueError):m.check_run(run,{**art,**bad},COMMIT,RUN)
    def test_integrity(self):
        data,run,art,files=fixture()
        c,s=m.unpack(data,COMMIT,m.digest(data))
        self.assertEqual(c["sha256"],m.digest(s));m.verify_entry(c,"dev")
        with self.assertRaises(ValueError):m.unpack(data+b"X",COMMIT,m.digest(data))
        with self.assertRaises(ValueError):m.unpack(data,"b"*40,m.digest(data))
        for changed in ({**files,ASSETS["source"]:b"tampered"},{**files,"extra":b"x"}):
            blob=archive(changed)
            with self.assertRaises(ValueError):m.unpack(blob,COMMIT,m.digest(blob))
        with self.assertRaises(ValueError):m.verify_entry({**c,"path":"companion/launcher/releases/../../../secret"},"dev")
        with self.assertRaises(ValueError):m.verify_entry({**c,"package":""},"dev")
        for key,value in ((ASSETS["bookmarklet"],b"javascript:wrong\n"),("build.json",m.json_bytes({**m.load(files["build.json"]),"rollbackBaseline":"wrong"}))):
            changed={**files,key:value}
            changed["SHA256SUMS.txt"]="".join(m.digest(v)+"  "+k+"\n" for k,v in changed.items() if k!="SHA256SUMS.txt").encode()
            blob=archive(changed)
            with self.assertRaises(ValueError):m.unpack(blob,COMMIT,m.digest(blob))
    def test_two_phase(self):
        data,run,art,_=fixture()
        old={"version":"0.6.0-dev-"+"b"*12,"path":"companion/launcher/releases/0.6.0-dev-"+"b"*12+".js","sha256":"0"*64}
        stable=m.STABLE
        current={"schema":1,"stable":stable,"dev":old}
        candidate,source=m.unpack(data,COMMIT,m.digest(data))
        real_stable=Path(__file__).resolve().parents[2]/stable["path"]
        with tempfile.TemporaryDirectory() as folder:
            repo=Path(folder)
            for path in m.FROZEN:
                dest=repo/path;dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_bytes((Path(__file__).resolve().parents[2]/path).read_bytes())
            target=repo/(m.BASE+"channels.json")
            target.parent.mkdir(parents=True,exist_ok=True)
            (target.parent/"releases").mkdir()
            target.write_bytes(m.json_bytes(current))
            def api(path):
                if path.endswith("/zip"):return data
                if "/artifacts?" in path:return m.json_bytes({"artifacts":[art]})
                if "/artifacts/" in path:return m.json_bytes(art)
                return m.json_bytes(run)
            with patch.object(m,"checkout",return_value=repo),patch.object(m,"forward"),patch.object(m,"api",side_effect=api):
                args=SimpleNamespace(commit=COMMIT,run=RUN,checkpoint="Verified synthetic checkpoint")
                m.prepare(args);self.assertEqual(m.load(target.read_bytes()),current)
                with self.assertRaises(ValueError):m.prepare(args)
                activate=SimpleNamespace(version=candidate["version"])
                record=(repo/candidate["path"]).parent/"publication.json"
                original=record.read_bytes();evidence=m.load(original)
                for bad in ({"run":True},{"artifact":"43"},{"artifact":0},{"checkpoint":""},{"checkpoint":"x"*501},{"commit":"b"*40}):
                    record.write_bytes(m.json_bytes({**evidence,**bad}))
                    with self.assertRaises(ValueError):m.read_evidence(record)
                record.write_bytes(b" "* (m.EVIDENCE_LIMIT+1))
                with self.assertRaises(ValueError):m.read_evidence(record)
                record.write_bytes(m.json_bytes({**evidence,"artifact":44}))
                with patch.object(m,"hosted") as hosted:
                    with self.assertRaises(ValueError):m.activate(activate)
                    hosted.assert_not_called()
                self.assertEqual(m.load(target.read_bytes()),current)
                record.write_bytes(original)
                with patch.object(m,"hosted",side_effect=ValueError("Not hosted yet")):
                    with self.assertRaises(ValueError):m.activate(activate)
                self.assertEqual(m.load(target.read_bytes()),current)
                target.write_bytes(m.json_bytes({**current,"dev":{**old,"sha256":"1"*64}}))
                with patch.object(m,"hosted"):
                    with self.assertRaises(ValueError):m.activate(activate)
                target.write_bytes(m.json_bytes(current))
                with patch.object(m,"hosted") as hosted:m.activate(activate);self.assertEqual(hosted.call_count,len(m.FROZEN)+5)
                self.assertEqual(m.load(target.read_bytes()),{**current,"dev":candidate})
                self.assertEqual((repo/candidate["path"]).read_bytes(),source)
                target.write_bytes(m.json_bytes({**current,"stable":{**stable,"sha256":"f"*64}}))
                with self.assertRaises(ValueError):m.manifest(repo)
if __name__=="__main__":unittest.main()
