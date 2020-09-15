# -*- coding: utf-8 -*-
# @Author: Alex Hamilton - https://github.com/alexhamiltonRN
# @Date: 2020-01-29
from typing import List, Tuple

import pymongo
from pymongo.database import Database
from pymongo.collection import Collection
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import Settings, get_settings
from app.models import *
from bson import ObjectId
from datetime import datetime


class DatabaseContext:
    def __init__(self, settings: Settings = get_settings()):
        self.client: pymongo.MongoClient = AsyncIOMotorClient(
            host=settings.db_host,
            authSource=settings.db_name,
            username=settings.db_user,
            password=settings.db_pass,
        )
        db: Database = self.client[settings.db_name]
        self.annotators: Collection = db.get_collection("annotators")
        self.segments: Collection = db.get_collection("segment_records")
        self.audit_events: Collection = db.get_collection("audit_events")
        self.sessions: Collection = db.get_collection("active_sessions")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.client.close()

    async def active_session(self, user_IP: str):
        return await self.sessions.find_one_and_update(
                    {"user_IP": user_IP},
                    {"$set":
                        {"lastLoginAt": datetime.now()}
                    }
                )

    async def create_session(self, user_IP: str):
        await self.sessions.insert_one({
            "lastLoginAt": datetime.now(),
            "user_IP": user_IP
        })
        return

    async def set_campaign(self, username: str, campaign: AnnotationCampaign):
        return await self.annotators.update_one(
            {"username": username},
            [
                {
                    "$set": {
                        "previous_campaigns": {
                            "$concatArrays": [
                                ["$current_campaign"],
                                "$previous_campaigns",
                            ]
                        },
                        "current_campaign": campaign.dict(),
                    },
                },
            ],
        )

    async def reset_password(self, username: str, hashed_password: str):
        return await self.annotators.update_one(
            {"username": username}, {"$set": {"hashed_password": hashed_password}}
        )

    async def add_user(self, name: str, username: str, designation: str, password: str):
        return await self.annotators.insert_one(
            {
                "name": name,
                "username": username,
                "designation": designation,
                "hashed_password": password,
            }
        )

    async def get_annotator(self, username: str) -> Optional[Annotator]:
        res = await self.annotators.find_one({"username": username})
        return Annotator(**res) if res is not None else res

    async def get_admin_annotator(self, username: str) -> Optional[Annotator]:
        res = await self.annotators.find_one({"username": username})
        if res.designation != "MD":
            res = None
        return Annotator(**res) if res is not None else res

    async def list_annotators(self) -> List[Annotator]:
        res = self.annotators.find(projection={"hashed_password": False})
        return [Annotator(**a) async for a in res]

    async def find_segments(self, segment_ids: List[ObjectId]):
        res = self.segments.find({"_id": {"$in": segment_ids}})
        return [SegmentRecord(**sr) async for sr in res]

    async def list_segments(
        self, after: ObjectId = None, before: ObjectId = None, limit: int = 10
    ) -> List[SegmentRecord]:
        assert not (before and after), "only one of before and after is permitted"

        criteria = {}
        id_order = pymongo.ASCENDING
        if before:
            criteria = {"_id": {"$lt": ObjectId(before)}}
            # ensure the prior `limit` records are retrieved
            # instead of the first `limit` in the collection
            id_order = pymongo.DESCENDING
        elif after:
            criteria = {"_id": {"$gt": ObjectId(after)}}

        res = await self.segments.find(
            criteria, sort=[("_id", id_order)], limit=limit
        ).to_list(None)
        # records are reversed when querying "before" to undo the descending sort order
        return [SegmentRecord(**sr) for sr in (reversed(res) if before else res)]

    async def get_segment(self, id: ObjectId) -> SegmentRecord:
        return SegmentRecord(**await self.segments.find_one(id))

    async def update_annotation(
        self, id: ObjectId, annotator: str, annotation: Annotation
    ):
        assert annotator, "no annotator specified"
        async with await self.client.start_session() as s:
            await self.segments.update_one(
                {"_id": id},
                # TODO (brian): is there a better way to specify a nested path?
                {"$set": {"annotations." + annotator: annotation.dict()}},
                session=s,
            )
            await self.annotators.update_one(
                {"username": annotator},
                {"$set": {"current_campaign.last_annotated_segment": id}},
                session=s,
            )

    async def add_audit_event(self, event: AuditEvent):
        await self.audit_events.insert_one(event.dict())
