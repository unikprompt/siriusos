"""Behavioral tests for mmrag._retry_generate_content.

Run from knowledge-base/scripts:

    python -m _test_clients.test_retry

Exits 0 on all-pass, 1 on any failure. Three scenarios:

  1. transient_then_success: 503 → 200 → returns response, no raise
  2. all_exhausted: 503 → 503 → 503 → raises last APIError
  3. fail_fast_nontransient: 403 (with '503' in body) → raises immediately;
     proves the predicate is structural (.code / .status), not textual.

backoffs is passed as (0, 0, 0) so tests run in milliseconds.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
if PARENT not in sys.path:
    sys.path.insert(0, PARENT)

import mmrag
from _test_clients import fault_injection


FAILURES = []


def _check(label, cond, detail=""):
    if cond:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}: {detail}")
        FAILURES.append(label)


def test_transient_then_success():
    print("\n[test 1/3] transient_then_success: 503 -> 200")
    client = fault_injection.FaultInjectionClient(
        fault_injection._parse_script("503:gemini busy,200:hello world")
    )
    response = mmrag._retry_generate_content(
        client, model="x", contents=["x"], backoffs=(0, 0, 0)
    )
    _check("returns response after one transient", response is not None)
    _check(
        "response.text matches scripted message",
        getattr(response, "text", None) == "hello world",
        detail=f"got {getattr(response, 'text', None)!r}",
    )
    _check(
        "consumed exactly 2 attempts",
        client.models._index == 2,
        detail=f"got {client.models._index}",
    )


def test_all_exhausted():
    print("\n[test 2/3] all_exhausted: 503 -> 503 -> 503 -> re-raise")
    client = fault_injection.FaultInjectionClient(
        fault_injection._parse_script("503,503,503")
    )
    raised = None
    try:
        mmrag._retry_generate_content(
            client, model="x", contents=["x"], backoffs=(0, 0, 0)
        )
    except Exception as e:
        raised = e
    _check("raises after all attempts exhausted", raised is not None)
    if raised is not None:
        _check("raised.code is 503", getattr(raised, "code", None) == 503)
        _check(
            "raised.status is UNAVAILABLE",
            getattr(raised, "status", None) == "UNAVAILABLE",
        )
    _check(
        "consumed exactly 3 attempts",
        client.models._index == 3,
        detail=f"got {client.models._index}",
    )


def test_fail_fast_nontransient():
    print("\n[test 3/3] fail_fast_nontransient: 403 (with '503' in body) -> raises immediately")
    client = fault_injection.FaultInjectionClient(
        fault_injection._parse_script(
            "403:Permission denied for resource ID 503-pseudo,200:should not reach"
        )
    )
    raised = None
    try:
        mmrag._retry_generate_content(
            client, model="x", contents=["x"], backoffs=(0, 0, 0)
        )
    except Exception as e:
        raised = e
    _check("raises immediately on non-transient", raised is not None)
    if raised is not None:
        _check("raised.code is 403", getattr(raised, "code", None) == 403)
        _check(
            "raised.status is PERMISSION_DENIED",
            getattr(raised, "status", None) == "PERMISSION_DENIED",
        )
    _check(
        "did NOT consume the second scripted attempt (predicate is structural, not textual)",
        client.models._index == 1,
        detail=f"got {client.models._index}",
    )


_EMBED_CFG = {"embedding_min_interval_s": 0, "embedding_backoffs": (0, 0, 0)}


def test_embed_transient_then_success():
    print("\n[test 4/6] embed transient_then_success: 429 -> 200")
    client = fault_injection.FaultInjectionClient(
        [], embed_script=fault_injection._parse_script("429:rate limited,200")
    )
    values = mmrag.embed_content(client, _EMBED_CFG, "hello")
    _check("returns an embedding after one transient", values is not None)
    _check(
        "embedding values are the scripted stub",
        list(values) == [0.1, 0.2, 0.3],
        detail=f"got {values!r}",
    )
    _check(
        "consumed exactly 2 embed attempts",
        client.models._embed_index == 2,
        detail=f"got {client.models._embed_index}",
    )


def test_embed_all_exhausted():
    print("\n[test 5/6] embed all_exhausted: 429 -> 429 -> 429 -> re-raise")
    client = fault_injection.FaultInjectionClient(
        [], embed_script=fault_injection._parse_script("429,429,429")
    )
    raised = None
    try:
        mmrag.embed_content(client, _EMBED_CFG, "hello")
    except Exception as e:
        raised = e
    _check("raises after all embed attempts exhausted", raised is not None)
    if raised is not None:
        _check("raised.code is 429", getattr(raised, "code", None) == 429)
        _check(
            "raised.status is RESOURCE_EXHAUSTED",
            getattr(raised, "status", None) == "RESOURCE_EXHAUSTED",
        )
    _check(
        "consumed exactly 3 embed attempts",
        client.models._embed_index == 3,
        detail=f"got {client.models._embed_index}",
    )


def test_embed_fail_fast_nontransient():
    print("\n[test 6/6] embed fail_fast_nontransient: 403 -> raises immediately")
    client = fault_injection.FaultInjectionClient(
        [], embed_script=fault_injection._parse_script("403:permission,200:should not reach")
    )
    raised = None
    try:
        mmrag.embed_content(client, _EMBED_CFG, "hello")
    except Exception as e:
        raised = e
    _check("raises immediately on non-transient", raised is not None)
    if raised is not None:
        _check("raised.code is 403", getattr(raised, "code", None) == 403)
    _check(
        "did NOT consume the second scripted embed attempt (predicate is structural)",
        client.models._embed_index == 1,
        detail=f"got {client.models._embed_index}",
    )


if __name__ == "__main__":
    test_transient_then_success()
    test_all_exhausted()
    test_fail_fast_nontransient()
    test_embed_transient_then_success()
    test_embed_all_exhausted()
    test_embed_fail_fast_nontransient()
    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} assertion(s)")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    print(f"ALL PASS (6 scenarios)")
    sys.exit(0)
