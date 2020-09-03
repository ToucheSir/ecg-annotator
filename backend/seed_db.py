import math
import random

from app.config import get_settings
from app.models import SegmentRecord
from pymongo import MongoClient
from bson import ObjectId

# bcrypt.hash("12345")
PWD_HASH = "$2b$12$t1bJ80/hO8s4g08uYcq6lOiXchctMKRUccPo42dRtmpaQi3gdE8fO"
ANNOTATORS = [
    {
        "name": "Billy Foo",
        "username": "bfoo",
        "designation": "MD",
        "hashed_password": PWD_HASH,
    },
    {
        "name": "Bob Bar",
        "username": "bbar",
        "designation": "Student",
        "hashed_password": PWD_HASH,
    },
    {
        "name": "Joe Baz",
        "username": "jbaz",
        "designation": "Student",
        "hashed_password": PWD_HASH,
    },
]
SIGNAL_HZ = 240
SECONDS = 10
MAX_mV = 4
N = 200


def generate_annotation(i: int, n_samples=SIGNAL_HZ * SECONDS):
    # +- 1-3 mV strip extents
    amplitude = (i % 3) + 0.75
    # i = 0 + 1 == 1/2 period
    # We increase i linearly so it's possible to identify the record number
    signal = [
        round(amplitude * math.sin(math.pi / n_samples * x * (i + 1)), 2)
        for x in range(n_samples)
    ]

    start_idx = random.randint(1, N) * SIGNAL_HZ
    return SegmentRecord(
        _id=ObjectId(i.to_bytes(12, byteorder="little")),
        case_id=f"case_{i}",
        pool_segment=ObjectId(b"123-456-7890"),
        start_idx=start_idx,
        stop_idx=start_idx + n_samples,
        zero_padded=False,
        signals={"I": signal},
        annotations={},
    ).dict()


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
        annotators.drop(session=sess)
        segments.drop(session=sess)
        db.get_collection("audit_events").drop(session=sess)
        with sess.start_transaction():
            annotators.insert_many(ANNOTATORS)
            segments.insert_many([generate_annotation(i) for i in range(N)])

    segment_ids = [s["_id"] for s in segments.find(projection=[])]
    annotators.update_many(
        {},
        {
            "$set": {
                "current_campaign": {
                    "name": "training",
                    "segments": segment_ids
                }
            }
        },
    )
