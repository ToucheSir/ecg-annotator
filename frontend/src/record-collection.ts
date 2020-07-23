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

export interface SegmentCollectionCursor
  extends AsyncIterator<Segment | null, Segment | null, Segment | null> {
  previous(): Promise<IteratorResult<Segment | null>>;
  position: number;
  length: number;
}

export default async function createSegmentCollection(
  baseUrl: URL,
  startId?: string,
  chunkSize: number = 10
): Promise<SegmentCollectionCursor> {
  const countUrl = new URL("count", baseUrl.href + "/");
  if (startId) countUrl.searchParams.set("start", startId);
  // Actual total count
  const countRes = await fetch(countUrl.href);
  const [subCount, count] = await countRes.json();

  let currentChunk = await fetchNextChunk(startId);
  let prevChunk = currentChunk.length
    ? await fetchPrevChunk(currentChunk[0]._id)
    : [];
  let nextChunk = currentChunk.length
    ? await fetchNextChunk(currentChunk[currentChunk.length - 1]._id)
    : [];

  async function fetchPrevChunk(before?: string): Promise<Segment[]> {
    const recordsUrl = new URL("?limit=" + chunkSize, baseUrl.href);
    if (before) recordsUrl.searchParams.set("before", before);
    const res = await fetch(recordsUrl.href);
    return await res.json();
  }

  async function fetchNextChunk(after?: string): Promise<Segment[]> {
    const recordsUrl = new URL("?limit=" + chunkSize, baseUrl.href);
    if (after) recordsUrl.searchParams.set("after", after);
    const res = await fetch(recordsUrl.href);
    return await res.json();
  }

  // TODO what if we start partway through the collection?
  let position = subCount - 1;
  let chunkIndex = -1;
  return {
    async previous() {
      if (position < 1 || !currentChunk.length) {
        return { value: null, done: false };
      }
      position--;

      if (--chunkIndex < 0) {
        nextChunk = currentChunk;
        currentChunk = prevChunk;
        prevChunk = await fetchPrevChunk(currentChunk[0]._id);
        chunkIndex = currentChunk.length - 1;
      }
      return { value: currentChunk[chunkIndex], done: false };
    },

    async next() {
      if (position + 1 >= count || !currentChunk.length) {
        return { value: null, done: true };
      }
      position++;

      if (++chunkIndex >= currentChunk.length) {
        prevChunk = currentChunk;
        currentChunk = nextChunk;
        nextChunk = await fetchNextChunk(
          currentChunk[currentChunk.length - 1]._id
        );
        chunkIndex = 0;
      }
      return { value: currentChunk[chunkIndex], done: false };
    },

    get position() {
      return position;
    },

    length: count,
  };
}
