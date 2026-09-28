import { describe, expect, it } from "vitest";

import type { MatchPlanDto } from "../../types/ipc";
import { groupOperationsByLanguage } from "./languageGroups";

function planWithLanguages(languagesByVideo: (string | null)[][]): MatchPlanDto {
  let id = 0;
  return {
    planId: "plan-1",
    relocationMode: "rename",
    videos: languagesByVideo.map((languages, videoIndex) => ({
      videoName: `video-${videoIndex}.mkv`,
      matches: languages.map((language) => {
        const operationId = id++;
        return {
          id: operationId,
          subtitleName: `subtitle-${operationId}.srt`,
          targetPath: `/media/subtitle-${operationId}.srt`,
          confidence: 90,
          language,
          reasoning: [],
        };
      }),
    })),
    unmatchedVideos: [],
    unmatchedSubtitles: [],
  };
}

describe("groupOperationsByLanguage", () => {
  it("returns only languages present in the plan, in first-appearance order", () => {
    const groups = groupOperationsByLanguage(planWithLanguages([["tc", "en", "tc"]]));

    expect(groups.map(({ code }) => code)).toEqual(["tc", "en"]);
    expect(groups.map(({ operationIds }) => operationIds)).toEqual([[0, 2], [1]]);
  });

  it("groups one code across videos", () => {
    const groups = groupOperationsByLanguage(planWithLanguages([["en"], ["tc", "en"]]));

    expect(groups).toEqual([
      { code: "en", operationIds: [0, 2] },
      { code: "tc", operationIds: [1] },
    ]);
  });

  it("returns exactly the Other group for a null-only plan", () => {
    expect(groupOperationsByLanguage(planWithLanguages([[null, null]]))).toEqual([
      { code: null, operationIds: [0, 1] },
    ]);
  });

  it("places undetected operations last and includes every id exactly once", () => {
    const plan = planWithLanguages([[null, "tc"], ["en", null, "tc"]]);
    const groups = groupOperationsByLanguage(plan);
    const groupedIds = groups.flatMap(({ operationIds }) => operationIds);
    const planIds = plan.videos.flatMap((video) => video.matches.map(({ id }) => id));

    expect(groups.map(({ code }) => code)).toEqual(["tc", "en", null]);
    expect(groupedIds).toHaveLength(planIds.length);
    expect(new Set(groupedIds)).toEqual(new Set(planIds));
  });
});
