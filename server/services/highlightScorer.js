const AUDIO_WEIGHT = 0.5;
const MOTION_WEIGHT = 0.5;
const SMOOTHING_WINDOW = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function smoothScores(rows) {
  const radius = Math.floor(SMOOTHING_WINDOW / 2);

  return rows.map((row, index) => {
    const window = [];
    for (let i = index - radius; i <= index + radius; i += 1) {
      if (rows[i]) {
        window.push(rows[i].combinedScoreRaw);
      }
    }

    return {
      ...row,
      combinedScore: Number(average(window).toFixed(2)),
    };
  });
}

function mergeOverlaps(candidates) {
  if (!candidates.length) {
    return [];
  }

  const sorted = [...candidates].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      const next = {
        ...last,
        end: Math.max(last.end, current.end),
        duration: Math.max(last.end, current.end) - last.start,
      };

      if (current.combinedScore > last.combinedScore) {
        next.combinedScore = current.combinedScore;
        next.audioScore = current.audioScore;
        next.motionScore = current.motionScore;
        next.peakSecond = current.peakSecond;
        next.audioSpark = current.audioSpark;
        next.motionSpark = current.motionSpark;
      }

      merged[merged.length - 1] = next;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function toSecondMap(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row.second] = Number(row[key] || 0);
    return acc;
  }, {});
}

function scoreHighlights({
  audioTimeline,
  motionTimeline,
  duration,
  clipDuration,
  minScore,
}) {
  const totalSeconds = Math.ceil(duration || 0);
  const audioMap = toSecondMap(audioTimeline, 'audioScore');
  const motionMap = toSecondMap(motionTimeline, 'motionScore');

  const mergedRows = [];
  for (let second = 0; second <= totalSeconds; second += 1) {
    const audioScore = audioMap[second] || 0;
    const motionScore = motionMap[second] || 0;
    const combinedScoreRaw = Number(
      (audioScore * AUDIO_WEIGHT + motionScore * MOTION_WEIGHT).toFixed(2),
    );

    mergedRows.push({
      second,
      audioScore,
      motionScore,
      combinedScoreRaw,
      combinedScore: combinedScoreRaw,
    });
  }

  const smoothedRows = smoothScores(mergedRows);

  const peaks = [];
  for (let i = 1; i < smoothedRows.length - 1; i += 1) {
    const prev = smoothedRows[i - 1];
    const current = smoothedRows[i];
    const next = smoothedRows[i + 1];

    const isPeak =
      current.combinedScore > prev.combinedScore &&
      current.combinedScore >= next.combinedScore &&
      current.combinedScore >= minScore;

    if (isPeak) {
      peaks.push(current);
    }
  }

  const halfWindow = Math.floor(clipDuration / 2);

  const candidates = peaks.map((peak, index) => {
    const start = clamp(peak.second - halfWindow, 0, totalSeconds);
    const end = clamp(start + clipDuration, 0, totalSeconds);

    const audioSpark = [];
    const motionSpark = [];
    for (let second = start; second <= end; second += 1) {
      audioSpark.push(audioMap[second] || 0);
      motionSpark.push(motionMap[second] || 0);
    }

    return {
      id: `cand_${index + 1}`,
      start,
      end,
      duration: Number((end - start).toFixed(2)),
      peakSecond: peak.second,
      audioScore: Number(peak.audioScore.toFixed(2)),
      motionScore: Number(peak.motionScore.toFixed(2)),
      combinedScore: Number(peak.combinedScore.toFixed(2)),
      audioSpark,
      motionSpark,
      signals: [
        peak.audioScore > 0 ? 'audio' : null,
        peak.motionScore > 0 ? 'motion' : null,
      ].filter(Boolean),
    };
  });

  const mergedCandidates = mergeOverlaps(candidates)
    .filter((candidate) => candidate.combinedScore >= minScore)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .map((candidate, index) => ({
      ...candidate,
      id: `cand_${index + 1}`,
    }));

  return {
    candidates: mergedCandidates,
    timeline: smoothedRows,
    weights: {
      audio: AUDIO_WEIGHT,
      motion: MOTION_WEIGHT,
    },
  };
}

module.exports = {
  AUDIO_WEIGHT,
  MOTION_WEIGHT,
  scoreHighlights,
};
