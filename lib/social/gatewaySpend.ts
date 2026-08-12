import { gateway } from "ai";

// The two models social media generation actually calls — see
// imageGenerator.ts and recapVideoGenerator.ts. The Gateway spend report
// is account-wide (shared with every other Revalor product on this team),
// so results must be filtered down to just these two model IDs.
const IMAGE_MODEL = "bfl/flux-2-pro";
const VIDEO_MODEL = "klingai/kling-v2.6-t2v";

export interface MediaSpendSummary {
  totalCost: number;
  imageCost: number;
  videoCost: number;
  imageRequests: number;
  videoRequests: number;
  rangeStart: string;
  rangeEnd: string;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getMediaGenerationSpend(days = 30): Promise<MediaSpendSummary> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const rangeStart = toDateKey(start);
  const rangeEnd = toDateKey(end);

  const report = await gateway.getSpendReport({
    startDate: rangeStart,
    endDate: rangeEnd,
    groupBy: "model",
  });

  const imageRow = report.results.find((r) => r.model === IMAGE_MODEL);
  const videoRow = report.results.find((r) => r.model === VIDEO_MODEL);

  const imageCost = imageRow?.totalCost ?? 0;
  const videoCost = videoRow?.totalCost ?? 0;

  return {
    totalCost: imageCost + videoCost,
    imageCost,
    videoCost,
    imageRequests: imageRow?.requestCount ?? 0,
    videoRequests: videoRow?.requestCount ?? 0,
    rangeStart,
    rangeEnd,
  };
}
