"""The PDF gate must reject skipped jobs and incomplete/contradictory reports."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("validate_pdf_ua", Path(__file__).resolve().parents[1] / "validate_pdf_ua.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
VALID = '''<report><jobs><job><validationReport jobEndStatus="normal" profileName="PDF/UA-2 + Tagged PDF validation profile" isCompliant="true"><details failedRules="0" failedChecks="0"/></validationReport></job></jobs><batchSummary totalJobs="1" failedToParse="0" encrypted="0" outOfMemory="0" veraExceptions="0"><validationReports compliant="1" nonCompliant="0" failedJobs="0">1</validationReports></batchSummary></report>'''


class PdfUaReportTests(unittest.TestCase):
    def test_accepts_only_complete_matching_success(self):
        module.assert_compliant(VALID)
        module.assert_compliant(VALID.replace("PDF/UA-2 + Tagged PDF", "PDF/UA-1"), "ua1")

    def test_rejects_absent_wrong_profile_failed_rules_and_failed_jobs(self):
        for xml in [
            "<report/>", "not XML", VALID.replace("PDF/UA-2", "PDF/A-2B"),
            VALID.replace('isCompliant="true"', 'isCompliant="false"'),
            VALID.replace('jobEndStatus="normal"', 'jobEndStatus="aborted"'),
            VALID.replace('jobEndStatus="normal"', ''),
            VALID.replace('</job>', '</job><job/>'),
            VALID.replace('failedRules="0"', 'failedRules="1"'),
            VALID.replace('failedChecks="0"', 'failedChecks="1"'),
            VALID.replace('totalJobs="1"', 'totalJobs="0"'),
            VALID.replace('failedToParse="0"', 'failedToParse="1"'),
            VALID.replace('veraExceptions="0"', 'veraExceptions="1"'),
            VALID.replace('failedJobs="0"', 'failedJobs="1"'),
            VALID.replace('nonCompliant="0"', 'nonCompliant="1"'),
            VALID.replace('<details failedRules="0" failedChecks="0"/>', ''),
            VALID.replace('</job>', '</job><job><validationReport profileName="PDF/UA-2 validation profile" isCompliant="true"/></job>'),
        ]:
            with self.subTest(xml=xml), self.assertRaises((ValueError, module.ET.ParseError)):
                module.assert_compliant(xml)
