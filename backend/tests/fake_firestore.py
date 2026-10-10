"""Just enough of the Firestore client for the services under test (no network)."""

from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from firebase_admin import firestore

_clock = itertools.count()
_EPOCH = datetime(2026, 10, 1, tzinfo=timezone.utc)


def _resolve(data: Dict[str, Any]) -> Dict[str, Any]:
    # Strictly increasing timestamps keep ordering deterministic.
    return {
        key: (_EPOCH + timedelta(seconds=next(_clock)) if value is firestore.SERVER_TIMESTAMP else value)
        for key, value in data.items()
    }


class Snapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]]):
        self.id, self._data, self.exists = doc_id, data, data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class DocRef:
    def __init__(self, store: Dict[str, Dict[str, Any]], doc_id: str):
        self._store, self.id = store, doc_id

    def get(self):
        return Snapshot(self.id, self._store.get(self.id))

    def set(self, data):
        self._store[self.id] = _resolve(data)

    def update(self, data):
        if self.id not in self._store:
            raise KeyError(f"No document to update: {self.id}")
        self._store[self.id].update(_resolve(data))


class Query:
    def __init__(self, store: Dict[str, Dict[str, Any]], filters=None, order=None, limit=None):
        self._store, self._filters, self._order, self._limit = store, filters or [], order, limit

    def where(self, filter):  # noqa: A002 - mirrors the Firestore keyword
        assert filter.op_string == "=="
        return Query(self._store, self._filters + [(filter.field_path, filter.value)], self._order, self._limit)

    def order_by(self, field, direction=firestore.Query.ASCENDING):
        return Query(self._store, self._filters, (field, direction), self._limit)

    def limit(self, count):
        return Query(self._store, self._filters, self._order, count)

    def stream(self):
        rows = [(doc_id, data) for doc_id, data in self._store.items() if all(data.get(f) == v for f, v in self._filters)]
        if self._order:
            field, direction = self._order
            rows.sort(key=lambda item: item[1].get(field) or _EPOCH, reverse=direction == firestore.Query.DESCENDING)
        for doc_id, data in rows[: self._limit]:
            yield Snapshot(doc_id, data)


class Collection(Query):
    def __init__(self, store: Dict[str, Dict[str, Any]]):
        super().__init__(store)
        self._ids = itertools.count(1)

    def document(self, doc_id):
        return DocRef(self._store, doc_id)

    def add(self, data):
        doc_id = f"doc{next(self._ids)}"
        self._store[doc_id] = _resolve(data)
        return None, DocRef(self._store, doc_id)


class FakeFirestore:
    def __init__(self):
        self.data: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._collections: Dict[str, Collection] = {}

    def collection(self, name) -> Collection:
        if name not in self._collections:
            self._collections[name] = Collection(self.data.setdefault(name, {}))
        return self._collections[name]

    def docs(self, name) -> List[Dict[str, Any]]:
        return [{"id": doc_id, **doc} for doc_id, doc in self.data.get(name, {}).items()]
