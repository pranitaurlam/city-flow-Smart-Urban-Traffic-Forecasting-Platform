"""Parsing event listings pasted from BookMyShow, and importing them."""

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.bookmyshow import match_venue, parse_listing
from app.db import Base, get_session, make_engine
from app.main import app
from app.venues import upsert_venues

TODAY = date(2026, 11, 26)
# The import endpoint parses against the real clock, so read every saved row
# back through a window wide enough to contain it. Passed as params, not
# interpolated: the "+00:00" offset would decode as a space in a raw query.
def saved_events(client):
    end = (datetime.now(timezone.utc) + timedelta(days=1200)).isoformat()
    r = client.get("/api/events", params={"end": end})
    assert r.status_code == 200, r.text
    return r.json()

VENUES = [
    ("palace-grounds", "Palace Grounds"),
    ("chinnaswamy-stadium", "M. Chinnaswamy Stadium"),
    ("biec", "Bangalore International Exhibition Centre (BIEC)"),
    ("chowdiah-memorial-hall", "Chowdiah Memorial Hall"),
]

PASTE = """Filters
Sort by
Arijit Singh Live In Concert
Sat, 6 Dec, 7:00 PM
Palace Grounds, Bengaluru
₹1,500 onwards
Interested

Kenny Sebastian: Standup Special
Sun, 14 Dec, 8:00 PM
Chowdiah Memorial Hall
₹799 onwards

India Tech Expo 2026
3 Dec
BIEC

Some Random Gig
12 Dec, 9:00 PM
Hard Rock Cafe, Bengaluru
"""


@pytest.fixture()
def client(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'bms.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as session:
        upsert_venues(session)

    def override():
        with Session() as session:
            yield session

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- parser ---------------------------------------------------------------


def test_reads_title_time_and_venue():
    events = parse_listing(PASTE, VENUES, today=TODAY)
    assert len(events) == 4

    concert = events[0]
    assert concert.title == "Arijit Singh Live In Concert"
    assert concert.category == "concert"
    assert (concert.starts_at.month, concert.starts_at.day) == (12, 6)
    assert (concert.starts_at.hour, concert.starts_at.minute) == (19, 0)
    assert concert.venue_slug == "palace-grounds"
    assert concert.ok


def test_price_and_chrome_lines_are_not_mistaken_for_venues():
    events = parse_listing(PASTE, VENUES, today=TODAY)
    assert all("₹" not in (e.venue_text or "") for e in events)
    assert all(e.title not in {"Filters", "Sort by", "Interested"} for e in events)


def test_category_drives_duration():
    by_title = {e.title: e for e in parse_listing(PASTE, VENUES, today=TODAY)}
    comedy = by_title["Kenny Sebastian: Standup Special"]
    assert comedy.category == "comedy"
    assert (comedy.ends_at - comedy.starts_at).total_seconds() / 3600 == 2.0


def test_date_only_expo_starts_in_the_morning_not_at_night():
    expo = next(e for e in parse_listing(PASTE, VENUES, today=TODAY) if e.category == "expo")
    assert expo.starts_at.hour == 10
    assert expo.ends_at.day == expo.starts_at.day
    assert any("assumed" in issue for issue in expo.issues)


def test_untracked_venue_is_reported_not_guessed():
    gig = next(e for e in parse_listing(PASTE, VENUES, today=TODAY) if "Random" in e.title)
    assert gig.venue_slug is None
    assert not gig.ok
    assert any("not a tracked venue" in issue for issue in gig.issues)


def test_missing_year_rolls_forward_to_the_next_occurrence():
    # 3 Jan is already past on 26 Nov 2026, so it belongs to 2027.
    events = parse_listing("New Year Gig\n3 Jan, 8:00 PM\nPalace Grounds", VENUES, today=TODAY)
    assert events[0].starts_at.year == 2027


def test_printed_weekday_settles_the_year():
    # 2 Jan 2027 is a Saturday; 2 Jan 2028 is a Sunday.
    events = parse_listing("Gig\nSun, 2 Jan, 8:00 PM\nPalace Grounds", VENUES, today=TODAY)
    assert events[0].starts_at.year == 2028


def test_a_wrong_weekday_never_drops_the_card():
    # 20 Mar 2027 is a Saturday, so "Fri, 20 Mar" disagrees with every nearby
    # year. The event must still come through, dated to the next occurrence.
    events = parse_listing(
        "RCB vs CSK IPL\nFri, 20 Mar, 7:30 PM\nM. Chinnaswamy Stadium", VENUES, today=TODAY
    )
    assert len(events) == 1
    assert events[0].starts_at.year == 2027
    assert events[0].venue_slug == "chinnaswamy-stadium"


def test_cards_without_a_date_are_skipped():
    assert parse_listing("Mystery Show\nPalace Grounds\n₹500", VENUES, today=TODAY) == []


@pytest.mark.parametrize(
    "text,slug",
    [
        ("Palace Grounds, Bengaluru", "palace-grounds"),
        ("palace grounds", "palace-grounds"),
        ("BIEC", "biec"),
        ("M. Chinnaswamy Stadium, Bangalore", "chinnaswamy-stadium"),
        ("Hard Rock Cafe", None),
        ("", None),
    ],
)
def test_venue_matching(text, slug):
    match = match_venue(text, VENUES)
    assert (match[0] if match else None) == slug


# --- endpoint --------------------------------------------------------------


def test_dry_run_previews_without_saving(client):
    r = client.post("/api/events/import/bookmyshow", json={"text": PASTE})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dry_run"] is True
    assert body["created"] == 0
    assert body["skipped"] == 1
    assert len(body["events"]) == 4
    assert client.get("/api/events").json() == []


def test_import_saves_matched_rows_only(client):
    r = client.post(
        "/api/events/import/bookmyshow",
        json={"text": PASTE, "dry_run": False, "source_url": "https://in.bookmyshow.com/x"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3
    assert r.json()["skipped"] == 1

    saved = saved_events(client)
    assert len(saved) == 3
    assert {e["venue"]["slug"] for e in saved} == {
        "palace-grounds",
        "chowdiah-memorial-hall",
        "biec",
    }
    assert all(e["url"] == "https://in.bookmyshow.com/x" for e in saved)


def test_pasting_the_same_listing_twice_does_not_duplicate(client):
    first = client.post(
        "/api/events/import/bookmyshow", json={"text": PASTE, "dry_run": False}
    ).json()
    assert first["created"] == 3
    assert first["duplicates"] == 0

    second = client.post(
        "/api/events/import/bookmyshow", json={"text": PASTE, "dry_run": False}
    ).json()
    assert second["created"] == 0
    assert second["duplicates"] == 3
    assert len(saved_events(client)) == 3
    assert any("already in CityFlow" in i for e in second["events"] for i in e["issues"])


def test_dry_run_flags_rows_already_stored(client):
    client.post("/api/events/import/bookmyshow", json={"text": PASTE, "dry_run": False})
    preview = client.post("/api/events/import/bookmyshow", json={"text": PASTE}).json()
    assert preview["duplicates"] == 3
    assert preview["created"] == 0


def test_attendance_defaults_to_venue_capacity(client):
    client.post("/api/events/import/bookmyshow", json={"text": PASTE, "dry_run": False})
    saved = {e["venue"]["slug"]: e for e in saved_events(client)}
    assert saved["palace-grounds"]["expected_attendance"] == 50000


def test_rejects_text_that_is_too_short(client):
    assert client.post("/api/events/import/bookmyshow", json={"text": "hi"}).status_code == 422
