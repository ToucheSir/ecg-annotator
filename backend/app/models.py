from datetime import datetime
from typing import List, Optional, Any, Mapping
from pydantic import BaseModel, BaseConfig, Field, SecretStr
from bson import ObjectId


class HasId(BaseModel):
    id: ObjectId = Field(..., alias="_id")

    class Config(BaseConfig):
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        orm_mode = True


class AnnotationCampaign(BaseModel):
    name: str
    segments: List[ObjectId] = []
    last_annotated_segment: Optional[ObjectId]

    class Config(BaseConfig):
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        orm_mode = True


class Annotator(HasId):
    name: str
    # Usually first initial + last name
    username: str
    designation: str
    hashed_password: Optional[SecretStr]

    current_campaign: Optional[AnnotationCampaign]
    previous_campaigns: List[AnnotationCampaign] = []


class Annotation(BaseModel):
    label: str
    confidence: float = 1.0
    comments: Optional[str]

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        orm_mode = True


class SegmentRecord(HasId):
    case_id: str
    # Points to annotation_pool collection
    pool_segment: ObjectId
    
    start_idx: int
    stop_idx: int
    zero_padded: bool

    signals: Mapping[str, Any] = {}
    annotations: Mapping[str, Annotation] = {}


class AuditEvent(BaseModel):
    username: str
    timestamp: datetime
    route: str
    url: str
    path_params: Mapping[str, Any]
    query_params: Mapping[str, Any]
    body: Optional[Any]
