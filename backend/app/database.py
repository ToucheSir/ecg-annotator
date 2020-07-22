# -*- coding: utf-8 -*-
# @Author: Alex Hamilton - https://github.com/alexhamiltonRN
# @Date: 2020-01-29
from typing import List, Dict

import pymongo
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo.errors import WriteError
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import Settings, get_settings
from app.models import *


class DatabaseContext:
    def __init__(self, settings=get_settings()):
        self.client = AsyncIOMotorClient(
            host=settings.db_host,
            authSource=settings.db_name,
            username=settings.db_user,
            password=settings.db_pass,
        )
        db: Database = self.client[settings.db_name]
        self.annotators: Collection = db.get_collection("annotators")
        self.segments: Collection = db.get_collection(settings.db_segment_collection)
        self.audit_events: Collection = db.get_collection("audit_events")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.client.close()

    async def get_user(self, username: str ):
        res = self.annotators.find({"username": username})
        return [Annotator(**a) async for a in res]

    async def list_annotators(self) -> List[Annotator]:
        res = self.annotators.find()
        return [Annotator(**a) async for a in res]

    async def get_segment_count(self) -> int:
        return await self.segments.count_documents(filter={})

    async def list_segments(
        self, after: ObjectId = None, before: ObjectId = None, limit: int = 10
    ) -> List[AnnotatedSegment]:
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
        return [AnnotatedSegment(**sr) for sr in (reversed(res) if before else res)]

    async def get_segment(self, id: ObjectId) -> AnnotatedSegment:
        return AnnotatedSegment(**await self.segments.find_one(id))

    async def update_annotation(
        self, id: ObjectId, annotator: str, annotation: Annotation
    ):
        assert annotator, "no annotator specified"
        await self.segments.update_one(
            {"_id": id},
            # TODO (brian): is there a better way to specify a nested path?
            {"$set": {"annotations." + annotator: annotation.dict()}},
        )

    async def add_audit_event(self, event: AuditEvent):
        await self.audit_events.insert_one(event.dict())
