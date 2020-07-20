import math
import random

from app.config import Settings, get_settings
from pymongo import MongoClient

ANNOTATORS = [
    {"name": "Billy Foo", "username": "bfoo", "designation": "MD"},
    {"name": "Bob Bar", "username": "bbar", "designation": "Student"},
    {"name": "Joe Baz", "username": "bbar", "designation": "Student"},
]
SIGNAL_HZ = 240
MAX_mV = 4
N = 200


def generate_annotation():
    amplitude = random.random() * MAX_mV
    phase = random.random()
    period = random.random() * math.pi / SIGNAL_HZ
    signal = [amplitude * math.sin(period * x + phase) for x in range(SIGNAL_HZ * 10)]

    start_idx = random.randint(1, N) * SIGNAL_HZ
    return {
        "segment_record": "asdf1234",
        "start_idx": start_idx,
        "stop_idx": start_idx + SIGNAL_HZ * 10,
        "signals": {"I": signal},
        "annotations": {},
    }


if __name__ == "__main__":
    settings = get_settings()
    client = MongoClient(
        host=settings.db_host,
        authSource=settings.db_name,
        username=settings.db_user,
        password=settings.db_pass,
    )
    db = client.get_database(settings.db_name)
    annotators = db.get_collection("annotators")
    segments = db.get_collection(settings.db_segment_collection)

    with client.start_session() as sess:
        with sess.start_transaction():
            annotators.insert_many(ANNOTATORS)
            segments.insert_many([generate_annotation() for i in range(N)])
