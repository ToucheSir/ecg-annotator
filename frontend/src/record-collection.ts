import LRUCache from "lru-cache";

export interface Annotator {
  _id: string;
  name: string;
  username: string;
  designation: string;
  current_campaign: AnnotationCampaign;
}

export interface AnnotationCampaign {
  name: string;
  segments: string[];
  last_annotated_segment: string;
}

export interface Annotation {
  label: string;
  confidence: number;
  comments?: string;
}

export interface Segment {
  _id: string;
  case_id: string;
  signals: Record<string, number[]>;
  annotations: Record<string, Annotation>;
}

export enum ScanDirection {
  Forwards = 1,
  Backwards = -1,
}

export default class SegmentCollection {
  private cache: LRUCache<string, Promise<Segment>>;
  private segmentIds: string[];

  constructor(
    private baseUrl: URL,
    { segments: segmentIds }: AnnotationCampaign,
    private chunkSize: number = 20
  ) {
    this.cache = new LRUCache<string, Promise<Segment>>({ max: chunkSize * 2 });
    this.segmentIds = segmentIds;
  }

  private findRange(i: number, direction: ScanDirection): number[] {
    const moveIndex = i + direction * this.chunkSize;
    if (direction === ScanDirection.Forwards) {
      return [i, Math.min(moveIndex, this.segmentIds.length)];
    } else {
      return [Math.max(0, moveIndex), i + 1];
    }
  }

  get(i: number, direction: ScanDirection): Promise<Segment> {
    if (i < 0 || i >= this.segmentIds.length) {
      throw new RangeError();
    }

    const segmentId = this.segmentIds[i];
    // Reset age so the current segment doesn't get invalidated if it's cached
    this.cache.get(segmentId);
    const fetchIds = this.segmentIds
      .slice(...this.findRange(i, direction))
      .filter((id) => !this.cache.has(id));

    if (fetchIds.length) {
      const fetchParams = new URLSearchParams(
        fetchIds.map((id) => ["find", id])
      );
      const segmentReq = fetch(`${this.baseUrl.href}?${fetchParams}`);
      const segmentReqBody = segmentReq.then<Segment[]>((x) => x.json());
      for (const id of fetchIds) {
        this.cache.set(
          id,
          segmentReqBody.then(
            (segments) => segments.find((seg) => seg._id === id)!
          )
        );
      }
    }
    return this.cache.get(segmentId)!;
  }

  get length() {
    return this.segmentIds.length;
  }
}
