"""Fail closed on veraPDF rule violations, missing reports, or validator failures."""
import argparse
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


def assert_compliant(xml, flavour="ua2"):
    root = ET.fromstring(xml)
    if len(root.findall("./jobs/job")) != 1:
        raise ValueError("Expected exactly one PDF/UA validation job")
    reports = root.findall("./jobs/job/validationReport")
    expected = {"ua2": "PDF/UA-2 + Tagged PDF validation profile", "ua1": "PDF/UA-1 validation profile"}[flavour]
    if len(reports) != 1 or reports[0].get("jobEndStatus") != "normal" or reports[0].get("profileName") != expected or reports[0].get("isCompliant") != "true":
        raise ValueError("Expected exactly one compliant " + expected + " report")
    details = reports[0].find("details")
    if details is None or details.get("failedRules") != "0" or details.get("failedChecks") != "0":
        raise ValueError("PDF/UA validation has failed or missing rule results")
    summary = root.find("batchSummary")
    if summary is None or summary.get("totalJobs") != "1" or any(summary.get(key) != "0" for key in ["failedToParse", "encrypted", "outOfMemory", "veraExceptions"]):
        raise ValueError("PDF/UA validation has failed or missing job results")
    counts = summary.find("validationReports")
    if counts is None or counts.get("compliant") != "1" or counts.get("nonCompliant") != "0" or counts.get("failedJobs") != "0":
        raise ValueError("PDF/UA validation job did not succeed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf")
    parser.add_argument("--validator", default="verapdf")
    parser.add_argument("--flavour", choices=["ua1", "ua2"], default="ua2")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    result = subprocess.run([args.validator, "--format", "xml", "--flavour", args.flavour, str(Path(args.pdf).resolve())], capture_output=True, timeout=120)
    Path(args.report).write_bytes(result.stdout)
    if result.returncode:
        raise SystemExit(result.stderr.decode("utf-8", errors="replace") or f"veraPDF exited {result.returncode}; see {args.report}")
    assert_compliant(result.stdout, args.flavour)
    print(f"PDF/{args.flavour.upper()} rules passed: {args.pdf}")


if __name__ == "__main__":
    main()
