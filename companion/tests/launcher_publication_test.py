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
    build={"schema":"rewards.development-package/2","channel":"development","status":"development-only; not live accepted","commit":COMMIT,"version":"0.6.1","assets":ASSETS}
    files={"build.json":m.json_bytes(build),"install.html":b"fixture","native-acceptance.md":b"fixture",
           ASSETS["bookmarklet"]:b"javascript:fixture",ASSETS["source"]:b"window.fixture=true;",
           ASSETS["extension"]:archive({"manifest.json":b'{"manifest_version":3,"version":"0.6.1","version_name":"development"}'})}
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
        for bad in ({"expired":True},{"digest":""},{"name":"wrong"},{"size_in_bytes":m.LIMIT+1}):
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
    def test_two_phase(self):
        data,run,art,_=fixture()
        old={"version":"0.6.0-dev-"+"b"*12,"path":"companion/launcher/releases/0.6.0-dev-"+"b"*12+".js","sha256":"0"*64}
        stable=m.STABLE
        current={"schema":1,"stable":stable,"dev":old}
        candidate,source=m.unpack(data,COMMIT,m.digest(data))
        real_stable=Path(__file__).resolve().parents[2]/stable["path"]
        with tempfile.TemporaryDirectory() as folder:
            repo=Path(folder)
            (repo/stable["path"]).parent.mkdir(parents=True)
            (repo/stable["path"]).write_bytes(real_stable.read_bytes())
            target=repo/(m.BASE+"channels.json")
            target.parent.mkdir(parents=True)
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
                with patch.object(m,"hosted",side_effect=ValueError("Not hosted yet")):
                    with self.assertRaises(ValueError):m.activate(activate)
                self.assertEqual(m.load(target.read_bytes()),current)
                target.write_bytes(m.json_bytes({**current,"dev":{**old,"sha256":"1"*64}}))
                with patch.object(m,"hosted"):
                    with self.assertRaises(ValueError):m.activate(activate)
                target.write_bytes(m.json_bytes(current))
                with patch.object(m,"hosted") as hosted:m.activate(activate);self.assertEqual(hosted.call_count,2)
                self.assertEqual(m.load(target.read_bytes()),{**current,"dev":candidate})
                self.assertEqual((repo/candidate["path"]).read_bytes(),source)
                target.write_bytes(m.json_bytes({**current,"stable":{**stable,"sha256":"f"*64}}))
                with self.assertRaises(ValueError):m.manifest(repo)
if __name__=="__main__":unittest.main()
