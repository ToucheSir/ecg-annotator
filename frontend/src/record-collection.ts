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
  completed: number;
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
    private chunkSize: number = 5
  ) {
    this.cache = new LRUCache<string, Promise<Segment>>({ max: chunkSize * 2 });
    this.segmentIds = segmentIds;
  }

  get(i: number, direction: ScanDirection): Promise<Segment> {
    if (i < 0 || i >= this.segmentIds.length) {
      throw new RangeError();
    }

    const segmentId = this.segmentIds[i];
    const moveIndex = Math.max(
      0,
      Math.min(this.segmentIds.length, i + direction * this.chunkSize)
    );
    const fetchIds = this.segmentIds
      .slice(Math.min(i, moveIndex), Math.max(i, moveIndex))
      .filter((id) => !this.cache.has(id));

    if (fetchIds.length) {
      const fetchParams = new URLSearchParams(
        fetchIds.map((id) => ["find", id])
      );
      const segmentPromise = fetch(`${this.baseUrl.href}?${fetchParams}`).then<
        Segment[]
      >((x) => x.json());
      for (const id of fetchIds) {
        this.cache.set(
          id,
          segmentPromise.then(
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
