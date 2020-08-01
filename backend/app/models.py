from datetime import datetime
from typing import List, Optional, Any, Union, Mapping
from pydantic import BaseModel, BaseConfig, Field, validator, SecretStr
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

    current_campaign: AnnotationCampaign


DEFAULT_SCHEMA = "CCDEF-1.1"


class Annotation(BaseModel):
    label: str
    confidence: float = 1.0
    comments: Optional[str]

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        orm_mode = True


class SegmentRecord(HasId):
    # TOD figure out these relationships
    # project: ObjectId
    # segmentation_strategy: ObjectId

    # metadata required to access raw hdf5 data
    # e.g. "mnt/data04/bm_data/hd5/Waveforms/Good/somefile.hd5"
    raw_filename: str
    # Where to look in h5 files
    # e.g. "Waveforms/Hemodynamics/I" ->
    raw_dataset: str
    # h5 tooling varies slightly according to schema (pytables vs h5py)
    # could use version number here -- and modify h5_utils to accommodate
    raw_schema: str = DEFAULT_SCHEMA

    # metadata required to access results hdf5 data
    results_filename: str
    results_dataset: str
    results_schema: str = DEFAULT_SCHEMA

    # details for the segment
    case_id: str
    # analagous to lead extracted from file
    signal_name: str
    start_idx: int
    stop_idx: int
    length: int
    # analagous to class extracted from file
    classification: str
    mean_class_confidence: float
    model_id: str
    inference_preprocessing: str

    # path to ndarray serialized to disk (no parallel access to raw hdf5)
    ndarray_path: Optional[str]


class AnnotatedSegment(HasId):
    segment_record: str
    start_idx: int
    stop_idx: int

    # annotations assiocated with this particular segment
    signals: Mapping[str, Any] = {}
    # annotations assiocated with this particular segment
    annotations: Mapping[str, Annotation] = {}


class AuditEvent(BaseModel):
    timestamp: datetime
    route: str
    url: str
    path_params: Mapping[str, Any]
    query_params: Mapping[str, Any]
    body: Optional[Any]
