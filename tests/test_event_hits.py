import tempfile
import unittest
from pathlib import Path

from scripts.event_hits import event_sites, parse_dashboard


ROOT = Path(__file__).resolve().parents[1]


class EventHitsTests(unittest.TestCase):
    def test_event_pages_have_one_counter_call(self):
        layout = (ROOT / "_layouts/event.html").read_text(encoding="utf-8")
        footer = (ROOT / "_includes/footer.html").read_text(encoding="utf-8")
        footer_condition = '{% if page.layout != "event" or page.event_date == nil %}'
        footer_start = footer.index(footer_condition)
        footer_end = footer.index("{% endif %}", footer_start)
        self.assertIn("event-{{ page.slug | uri_escape }}", layout)
        self.assertEqual(layout.count("navigator.sendBeacon("), 1)
        self.assertIn("navigator.sendBeacon(", footer[footer_start:footer_end])

    def test_parse_dashboard_totals(self):
        html = """<!doctype html><html><head><title>站台開啟計數</title></head><body>
        <table><thead><tr><th>站</th><th>總計</th></tr></thead><tbody>
        <tr><th scope="row">event-first-live</th><td class="num">1,234</td></tr>
        <tr><th scope="row">blog</th><td class="num">8</td></tr>
        </tbody></table></body></html>"""
        self.assertEqual(parse_dashboard(html), {"event-first-live": 1234, "blog": 8})

    def test_reject_non_dashboard_html(self):
        with self.assertRaises(ValueError):
            parse_dashboard("<!doctype html><title>Not found</title>")

    def test_event_sites_excludes_feedback_and_unpublished_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            events_dir = Path(tmp)
            (events_dir / "live-one.md").write_text(
                '---\nlayout: event\nevent_date: "2026-11-11"\n---\n', encoding="utf-8"
            )
            (events_dir / "live-draft.md").write_text(
                '---\nlayout: event\nevent_date: "2026-11-12"\npublished: false\n---\n',
                encoding="utf-8",
            )
            (events_dir / "feedback.md").write_text(
                "---\nlayout: event\n---\n", encoding="utf-8"
            )
            (events_dir / "not-event.md").write_text(
                '---\nlayout: page\nevent_date: "2026-11-13"\n---\n', encoding="utf-8"
            )
            self.assertEqual(event_sites(events_dir), ["event-live-one"])


if __name__ == "__main__":
    unittest.main()
