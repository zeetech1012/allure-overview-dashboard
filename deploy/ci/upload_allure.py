#!/usr/bin/env python3
"""Upload allure-results to allure-docker-service and (re)generate the report.

Used by .gitlab-ci.yml (publish-allure job). Reads env:
  ALLURE_BASE      base URL of allure-docker-service (required)
  ALLURE_PROJECT   project id / dashboard card (required)
  ALLURE_RESULTS   local results dir (default: allure-results)
  ALLURE_TOKEN     bearer token, only if the service has security enabled (optional)
  CI_PIPELINE_URL / CI_COMMIT_REF_NAME   passed through as report metadata (optional)
"""
import base64
import os
import sys
import glob
import requests

BASE = os.environ["ALLURE_BASE"].rstrip("/")
PROJECT = os.environ["ALLURE_PROJECT"]
RESULTS = os.environ.get("ALLURE_RESULTS", "allure-results")
TOKEN = os.environ.get("ALLURE_TOKEN")

session = requests.Session()
if TOKEN:
    session.headers["Authorization"] = f"Bearer {TOKEN}"


def ensure_project():
    # Idempotent: 201 created, 409 already exists -> both fine.
    r = session.post(f"{BASE}/projects", json={"id": PROJECT})
    if r.status_code not in (201, 409):
        print(f"[warn] create project -> {r.status_code}: {r.text[:200]}")


def send_results():
    files = [f for f in glob.glob(f"{RESULTS}/**/*", recursive=True) if os.path.isfile(f)]
    if not files:
        print("[error] no result files found in", RESULTS)
        sys.exit(1)
    payload = []
    for path in files:
        with open(path, "rb") as fh:
            payload.append({
                "file_name": os.path.basename(path),
                "content_base64": base64.b64encode(fh.read()).decode("ascii"),
            })
    r = session.post(f"{BASE}/send-results", params={"project_id": PROJECT}, json={"results": payload})
    r.raise_for_status()
    print(f"[ok] sent {len(payload)} result files")


def generate_report():
    params = {"project_id": PROJECT}
    # carry CI context into the report so the dashboard can deep-link back
    eb = os.environ.get("CI_PIPELINE_URL")
    if eb:
        params["execution_name"] = os.environ.get("CI_COMMIT_REF_NAME", "ci")
        params["execution_from"] = eb
        params["execution_type"] = "gitlab"
    r = session.get(f"{BASE}/generate-report", params=params)
    r.raise_for_status()
    data = r.json().get("data", {})
    print(f"[ok] report generated: {data.get('report_url', '(url n/a)')}")


if __name__ == "__main__":
    ensure_project()
    send_results()
    generate_report()
