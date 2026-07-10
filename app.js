// ============================================================================
// Data
// ============================================================================
const ATTENDEES = [
  { id: 'minsu', name: '민수', team: '기획팀' },
  { id: 'younghee', name: '영희', team: '디자인팀' },
  { id: 'chulsoo', name: '철수', team: '개발팀' },
  { id: 'jieun', name: '지은', team: '마케팅팀' },
  { id: 'suhyun', name: '수현', team: '영업팀' },
  { id: 'daeun', name: '다은', team: '개발팀' },
];

// ============================================================================
// 회의 목적 — 목적마다 추천 기준(가중치)이 달라진다. AI는 이 기준을 뒤에서 바꿀 뿐,
// 화면에는 "왜 이 시간인지" 이유로만 드러난다.
// ============================================================================
const MEETING_PURPOSES = [
  {
    id: 'share', label: '정보 공유', emphasis: '업무 효율',
    desc: '참석자의 업무 흐름 방해를 최소화하는 시간을 우선해요.',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M7 9h10M7 13h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    multiplier: { workContext: 1.5, fatigue: 1.6, requiredAttendees: 0.8 },
  },
  {
    id: 'gather', label: '의견 수렴', emphasis: '폭넓은 참여',
    desc: '가능한 많은 인원이 편하게 참여할 수 있는 시간을 우선해요.',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 18v-1a4 4 0 014-4h2a4 4 0 014 4v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M15 6.5c1.4.3 2.5 1.5 2.5 3s-1.1 2.7-2.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    multiplier: { attendanceRate: 1.5, preference: 1.4, requiredAttendees: 0.9 },
  },
  {
    id: 'decide', label: '의사결정', emphasis: '필참 참석률',
    desc: '의사결정에 필요한 필참자 전원의 참석을 최우선해요.',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 12.5l2.2 2.2L15.5 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    multiplier: { requiredAttendees: 1.8, attendanceRate: 1.2, preference: 0.7 },
  },
  {
    id: 'solve', label: '문제 해결', emphasis: '집중 가능한 여건',
    desc: '필참자가 몰입해서 논의할 수 있는 여건을 우선해요.',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.5 15.5L5 20M14.2 9.8a3.5 3.5 0 01-4.6 4.6L7 12l2.5-2.5 4.7.3z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 4l1.5 1.5L17 4l1.5 1.5L17 7l1.5 1.5L17 10l-1.5-1.5L14 10l-1.5-1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    multiplier: { requiredAttendees: 1.4, workContext: 1.3, fatigue: 1.2 },
  },
  {
    id: 'urgent', label: '긴급 대응', emphasis: '가장 빠른 소집',
    desc: '점수보다 가장 빨리 모일 수 있는 시간을 우선해요.',
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 3L5 14h5l-1 7 8-11h-5l1-7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    multiplier: { requiredAttendees: 1.2 },
    sortBySoonest: true,
  },
];

// ============================================================================
// Meeting suitability scoring engine
//
// The 100-point score is a sum of independently-computed factors. Each
// getXScore() takes plain inputs + a weight table and returns points on its
// own scale, so any one factor can be re-tuned or unit-tested without
// touching the others. The weight table itself varies by meeting purpose
// (see MEETING_PURPOSES/getPurposeWeights) so the same slot can score
// differently depending on why the meeting is being held.
// Presentation (label/description) is deliberately kept out of these
// functions — see getMeetingSummary() below — so the score math stays
// reusable even if the copy changes.
// ============================================================================
const SCORE_WEIGHTS = {
  requiredAttendees: 40,
  attendanceRate: 20,
  preference: 15,
  workContext: 15,
  fatigue: 5,
  travelBuffer: 5,
};

// 목적별 가중치 = 기본 가중치 * multiplier, 합이 100이 되도록 정규화.
function getPurposeWeights(purposeId) {
  const purpose = MEETING_PURPOSES.find(p => p.id === purposeId) || MEETING_PURPOSES[0];
  const raw = {};
  let sum = 0;
  Object.keys(SCORE_WEIGHTS).forEach(key => {
    const mult = (purpose.multiplier && purpose.multiplier[key]) || 1;
    raw[key] = SCORE_WEIGHTS[key] * mult;
    sum += raw[key];
  });
  const scale = 100 / sum;
  const weights = {};
  Object.keys(raw).forEach(key => { weights[key] = raw[key] * scale; });
  return weights;
}

function getRequiredScore(required, available, weights) {
  const ratio = required === 0 ? 1 : available / required;
  if (ratio === 1) return Math.round(weights.requiredAttendees);
  if (ratio >= 0.7) return Math.round(weights.requiredAttendees / 2);
  return 0;
}

function getAttendanceScore(total, available, weights) {
  return Math.round((available / total) * weights.attendanceRate);
}

function getPreferenceScore(total, matched, weights) {
  return Math.round((matched / total) * weights.preference);
}

function getContextScore(context, weights) {
  const unit = weights.workContext / 15;
  let score = weights.workContext;
  if (context.afterLunch) score -= 3 * unit;
  if (context.focusTime) score -= 5 * unit;
  if (context.afterBusinessTrip) score -= 4 * unit;
  if (context.backToBackMeeting) score -= 3 * unit;
  return Math.max(Math.round(score), 0);
}

function getFatigueScore(minutesBetweenMeetings, weights) {
  const unit = weights.fatigue / 5;
  if (minutesBetweenMeetings >= 60) return Math.round(5 * unit);
  if (minutesBetweenMeetings >= 30) return Math.round(3 * unit);
  if (minutesBetweenMeetings >= 15) return Math.round(2 * unit);
  return 0;
}

function getTravelScore(buffer, weights) {
  const unit = weights.travelBuffer / 5;
  if (buffer >= 15) return Math.round(5 * unit);
  if (buffer >= 10) return Math.round(3 * unit);
  return 0;
}

function calculateMeetingScore(input, weights) {
  const requiredScore = getRequiredScore(input.requiredCount, input.requiredAvailable, weights);
  const attendanceScore = getAttendanceScore(input.totalCount, input.availableCount, weights);
  const preferenceScore = getPreferenceScore(input.totalCount, input.preferenceMatched, weights);
  const contextScore = getContextScore(input.context, weights);
  const fatigueScore = getFatigueScore(input.breakMinutes, weights);
  const travelScore = getTravelScore(input.travelBuffer, weights);

  return {
    total: requiredScore + attendanceScore + preferenceScore + contextScore + fatigueScore + travelScore,
    detail: { requiredScore, attendanceScore, preferenceScore, contextScore, fatigueScore, travelScore },
  };
}

// Score → tier color class. Thresholds match getMeetingSummary()'s copy tiers 1:1.
function scoreLabelClass(score) {
  if (score >= 95) return 'great';
  if (score >= 85) return 'good';
  if (score >= 70) return 'caution';
  return 'poor';
}

// Score → the sentence a user actually reads. Kept separate from the score
// math above so copy can be tuned freely without touching calculation logic.
function getMeetingSummary(score) {
  if (score >= 95) {
    return {
      title: '가장 부담이 적은 시간이에요',
      message: '모두의 업무 흐름을 고려했을 때 가장 회의하기 좋은 시간이에요.',
    };
  }
  if (score >= 85) {
    return {
      title: '추천드리는 시간이에요',
      message: '필참자는 모두 참석 가능하고, 대부분의 참석자가 무리 없이 참여할 수 있어요.',
    };
  }
  if (score >= 70) {
    return {
      title: '회의는 가능해요',
      message: '참석은 가능하지만 일부 참석자에게는 조금 부담이 될 수 있어요.',
    };
  }
  return {
    title: '조금 아쉬운 시간이에요',
    message: '회의는 가능하지만 업무 흐름을 고려하면 다른 시간을 추천드려요.',
  };
}

// Icon + label metadata for rendering a score breakdown row per SCORE_WEIGHTS key.
const SCORE_BREAKDOWN_META = [
  {
    key: 'requiredScore', weightKey: 'requiredAttendees', label: '필참 참석',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 19c.7-3 3-5 6-5s5.3 2 6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="8" r="2.6" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 14.2c2.5.4 4 2.1 4.5 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'attendanceScore', weightKey: 'attendanceRate', label: '참석률',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    key: 'preferenceScore', weightKey: 'preference', label: '개인 선호',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5h.01M15.5 10.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 14.5c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'contextScore', weightKey: 'workContext', label: '업무 맥락',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.8"/></svg>'
  },
  {
    key: 'fatigueScore', weightKey: 'fatigue', label: '여유 시간',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="8" width="18" height="8" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M22 10.5v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'travelScore', weightKey: 'travelBuffer', label: '이동 시간',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 1118.5 10c0 5.2-6.5 11-6.5 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/></svg>'
  },
];

function buildScoreBreakdownHtml(detail, weights) {
  const w = weights || SCORE_WEIGHTS;
  return SCORE_BREAKDOWN_META.map(meta => {
    const value = detail[meta.key];
    const max = w[meta.weightKey];
    const pct = Math.round((value / max) * 100);
    return `
      <div class="score-row">
        <span class="score-row-icon">${meta.icon}</span>
        <span class="score-row-label">${meta.label}</span>
        <span class="score-row-bar"><span class="score-row-fill" style="width:${pct}%"></span></span>
        <span class="score-row-value">${value}<span class="score-row-max">/${Math.round(max)}</span></span>
      </div>`;
  }).join('');
}

// Full hand-authored heatmap + reasons for the top recommendation (slot 1),
// matching the brief's worked example. Slots 2–3 are generated proportionally
// to their scores so the grid stays internally consistent (color always
// matches the underlying score). Score/rank/reasons are computed fresh per
// meeting purpose by rankSlotsForPurpose() — never hardcoded here.
const SLOTS = [
  {
    id: 1,
    dayOffset: 1, // 기간으로 찾기 모드에서 기간 시작일로부터 며칠 뒤인지
    timeRange: '오후 2:00 – 3:00',
    scoreInput: {
      requiredCount: 3, requiredAvailable: 3,
      totalCount: 6, availableCount: 6,
      preferenceMatched: 5,
      context: { afterLunch: false, focusTime: false, afterBusinessTrip: false, backToBackMeeting: false },
      breakMinutes: 60,
      travelBuffer: 15,
    },
    columns: ['11:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
    recommendedCol: '14:00',
    people: {
      minsu: {
        status: ['caution', 'caution', 'good', 'good', 'good', 'caution'], score: 92, tag: '추천', tagClass: 'great',
        reasons: ['오전 집중 업무 종료', '외근 일정 없음', '다음 일정까지 충분한 여유']
      },
      younghee: {
        status: ['good', 'caution', 'caution', 'good', 'good', 'bad'], score: 71, tag: '가능하지만 비추천', tagClass: 'caution',
        reasons: ['점심 직후', '개인 선호 시간 아님']
      },
      chulsoo: {
        status: ['good', 'good', 'caution', 'bad', 'bad', 'caution'], score: 78, tag: '가능하지만 비추천', tagClass: 'caution',
        reasons: ['외근 직후 이동 여유 부족', '선호 시간 아님']
      },
      jieun: {
        status: ['caution', 'caution', 'good', 'good', 'caution', 'bad'], score: 90, tag: '추천', tagClass: 'great',
        reasons: ['집중 업무 시간 아님', '다음 일정까지 여유 충분']
      },
      suhyun: {
        status: ['good', 'caution', 'good', 'good', 'good', 'caution'], score: 88, tag: '추천', tagClass: 'great',
        reasons: ['외근 일정 없음', '선호 시간(오후)과 일치']
      },
      daeun: {
        status: ['good', 'good', 'good', 'caution', 'good', 'bad'], score: 85, tag: '추천', tagClass: 'great',
        reasons: ['이동시간 확보됨', '연속 회의 없음']
      },
    },
  },
  {
    id: 2,
    dayOffset: 3,
    timeRange: '오후 3:30 – 4:30',
    scoreInput: {
      requiredCount: 3, requiredAvailable: 3,
      totalCount: 6, availableCount: 6,
      preferenceMatched: 4,
      context: { afterLunch: true, focusTime: false, afterBusinessTrip: false, backToBackMeeting: false },
      breakMinutes: 30,
      travelBuffer: 10,
    },
    columns: ['13:30', '14:30', '15:30', '16:30', '17:30'],
    recommendedCol: '15:30',
    people: {
      minsu: {
        status: ['caution', 'good', 'good', 'good', 'caution'], score: 88, tag: '추천', tagClass: 'great',
        reasons: ['집중 업무 시간 아님', '연속 회의 사이 여유 있음']
      },
      younghee: {
        status: ['caution', 'good', 'good', 'good', 'bad'], score: 84, tag: '추천', tagClass: 'great',
        reasons: ['점심 영향 적음', '외근 일정 없음']
      },
      chulsoo: {
        status: ['good', 'caution', 'caution', 'bad', 'bad'], score: 68, tag: '가능하지만 비추천', tagClass: 'caution',
        reasons: ['외근 직후 이동 여유 부족']
      },
      jieun: {
        status: ['caution', 'good', 'good', 'caution', 'bad'], score: 86, tag: '추천', tagClass: 'great',
        reasons: ['다음 일정까지 여유 충분']
      },
      suhyun: {
        status: ['good', 'good', 'good', 'good', 'caution'], score: 90, tag: '추천', tagClass: 'great',
        reasons: ['선호 시간(오후)과 일치', '외근 일정 없음']
      },
      daeun: {
        status: ['good', 'good', 'caution', 'good', 'bad'], score: 83, tag: '추천', tagClass: 'great',
        reasons: ['이동시간 확보됨']
      },
    },
  },
  {
    id: 3,
    dayOffset: 0,
    timeRange: '오전 11:00 – 12:00',
    scoreInput: {
      requiredCount: 3, requiredAvailable: 3,
      totalCount: 6, availableCount: 5,
      preferenceMatched: 3,
      context: { afterLunch: false, focusTime: true, afterBusinessTrip: false, backToBackMeeting: true },
      breakMinutes: 15,
      travelBuffer: 10,
    },
    columns: ['09:30', '10:00', '11:00', '12:00'],
    recommendedCol: '11:00',
    people: {
      minsu: {
        status: ['bad', 'bad', 'good', 'caution'], score: 82, tag: '추천', tagClass: 'great',
        reasons: ['집중 업무 시간 직후 종료', '점심 전 여유 있음']
      },
      younghee: {
        status: ['bad', 'caution', 'good', 'caution'], score: 80, tag: '추천', tagClass: 'great',
        reasons: ['오전 선호 시간과 일치']
      },
      chulsoo: {
        status: ['caution', 'caution', 'caution', 'bad'], score: 62, tag: '가능하지만 비추천', tagClass: 'caution',
        reasons: ['월요일 오전 선호 회피 시간']
      },
      jieun: {
        status: ['bad', 'bad', 'good', 'good'], score: 88, tag: '추천', tagClass: 'great',
        reasons: ['외근 일정 없음']
      },
      suhyun: {
        status: ['bad', 'caution', 'good', 'caution'], score: 79, tag: '가능하지만 비추천', tagClass: 'caution',
        reasons: ['개인 선호 시간(오후)과 불일치']
      },
      daeun: {
        status: ['caution', 'good', 'good', 'caution'], score: 85, tag: '추천', tagClass: 'great',
        reasons: ['다음 일정까지 여유 있음']
      },
    },
  },
];

const PAST_MEETINGS = [
  { dateLabel: '어제 오후 3:00 – 4:00', attendeeIds: ['minsu', 'younghee', 'chulsoo'] },
  { dateLabel: '7월 3일 오전 11:00 – 12:00', attendeeIds: ['jieun', 'suhyun', 'daeun', 'minsu'] },
];

// 홈 화면 "나에게 온 제안" 더미 데이터 — 다른 사람이 나를 필참자로 초대했다고 가정한
// 시나리오. 이 프로토타입은 로그인 사용자가 한 명뿐이라 실제 발신자는 없고, 응답
// 화면(제목 → 참석자 → 후보 시간 → 제출)을 미리 확인해볼 수 있도록 넣어둔 예시다.
const INCOMING_INVITE = {
  organizerId: 'jieun',
  title: '주간 마케팅 싱크',
  candidateLabels: ['수요일 오전 10:00 – 11:00', '목요일 오후 2:00 – 3:00', '금요일 오전 11:00 – 12:00'],
  participantIds: ['jieun', 'minsu', 'suhyun'],
};

// 회의 상세의 "회의 생성 히스토리" 타임라인에 쓰이는 4단계 — 스테퍼(.stepper-step)의
// data-step 값과 짝을 맞춘다.
const HISTORY_STEPS = [
  { id: 'recommend', label: '추천 완료' },
  { id: 'collect', label: '필참 의견 수집' },
  { id: 'consensus', label: '합의 완료' },
  { id: 'confirm', label: '회의 확정' },
];

// ============================================================================
// 목적별 추천 랭킹 — 매번 새로 계산한다 (사전계산/캐시하지 않음). SLOTS의 원본
// people/reasons/columns 데이터는 건드리지 않고, 그 위에 목적별 점수/순위만 얹은
// 뷰 객체 3개를 반환한다.
// ============================================================================
function rankSlotsForPurpose(purposeId) {
  const purpose = MEETING_PURPOSES.find(p => p.id === purposeId) || MEETING_PURPOSES[0];
  const weights = getPurposeWeights(purposeId);

  const views = SLOTS.map(slot => {
    const { total, detail } = calculateMeetingScore(slot.scoreInput, weights);
    const summary = getMeetingSummary(total);
    return Object.assign({}, slot, {
      score: total,
      detail,
      weights,
      summary,
      scoreLabel: summary.title,
      attendanceRate: Math.round((slot.scoreInput.availableCount / slot.scoreInput.totalCount) * 100),
      dateISO: resolveSlotDate(slot),
    });
  });

  views.sort((a, b) => {
    if (purpose.sortBySoonest && a.dateISO !== b.dateISO) {
      return a.dateISO < b.dateISO ? -1 : 1;
    }
    return b.score - a.score;
  });

  return views.slice(0, 3);
}

// 추천 이유 — 점수를 만든 실제 컨텍스트 필드에서 문장을 뽑아낸다(하드코딩 금지).
// 마지막 한 줄은 항상 회의 목적에 맞춘 마무리 문장.
function buildRecommendReasons(slot, purposeId) {
  const purpose = MEETING_PURPOSES.find(p => p.id === purposeId) || MEETING_PURPOSES[0];
  const c = slot.scoreInput.context;
  const reasons = [];
  if (slot.scoreInput.requiredAvailable === slot.scoreInput.requiredCount) reasons.push('필참 일정 충돌 없음');
  if (!c.focusTime) reasons.push('집중 업무 시간 제외');
  if (!c.backToBackMeeting) reasons.push('연속 회의 최소');
  if (!c.afterBusinessTrip) reasons.push('외근 일정과 겹치지 않음');
  if (slot.scoreInput.breakMinutes >= 30) reasons.push('일정 사이 이동시간 확보');
  if (reasons.length === 0) reasons.push('참석자 업무 흐름을 종합적으로 고려함');

  const top = reasons.slice(0, 3);
  top.push(`${purpose.emphasis} 기준에 가장 적합`);
  return top;
}

// 제외 이유 — 왜 이 후보가 1위가 아닌지, 약점이 되는 컨텍스트 필드를 문장화한다.
function buildExclusionReasons(slot) {
  const c = slot.scoreInput.context;
  const reasons = [];
  const missing = slot.scoreInput.requiredCount - slot.scoreInput.requiredAvailable;
  if (missing > 0) reasons.push(`필참자 ${missing}명 불가`);
  if (c.afterBusinessTrip) reasons.push('외근 직후 일정');
  if (c.backToBackMeeting) reasons.push('연속 회의 있음');
  if (c.focusTime) reasons.push('집중 업무 시간과 겹침');
  if (slot.attendanceRate < 100) reasons.push(`참석률 낮음 (${slot.attendanceRate}%)`);
  if (slot.scoreInput.breakMinutes < 30) reasons.push('일정 간 여유 부족');
  if (reasons.length === 0) reasons.push('다른 후보보다 적합도가 낮음');
  return reasons.slice(0, 3);
}

// ============================================================================
// State
// ============================================================================
const state = {
  selectedAttendeeIds: [],   // ids currently added to the meeting being created
  attendance: {},            // id -> true(필참) / false(선택 참석)
  meetingTitle: '',          // 회의 제목 (선택 입력)
  purpose: null,              // 선택된 회의 목적 id (MEETING_PURPOSES)
  meetingDate: '',           // ISO date (YYYY-MM-DD) currently selected on Screen 02 (특정 날짜 지정 모드)
  searchMode: 'period',      // 'period'(기간으로 찾기) | 'specific'(특정 날짜 지정)
  periodStart: '',           // ISO date — 기간으로 찾기 모드의 시작일
  periodEnd: '',             // ISO date — 기간으로 찾기 모드의 종료일
  currentRecommendations: [], // rankSlotsForPurpose() 결과 (최대 3개), 이번 생성 흐름 동안 유지
  requiredIds: [],           // 이번 회의의 필참자 id
  optionalIds: [],           // 이번 회의의 선택 참석자 id
  responses: {},             // { [slotId]: { [attendeeId]: true|false } } — 필참자 의견 수집 상태
  respondDeadlineLabel: '오늘 오후 5시',
  activeRespondPersonId: null,
  activeRespondConfig: null, // 지금 열려있는 응답 시트가 무엇에 대한 것인지(제목/참석자/후보/제출 콜백)
  incomingInviteResponse: null, // 홈의 "나에게 온 제안" 더미 초대에 대한 내 응답 — null이면 아직 미응답
  consensusResult: [],       // computeConsensus() 결과 — 회의 확정 시 참고
  activeBooking: null,       // the booking currently shown on Screen 06
  bookings: [],              // confirmed upcoming meetings
<<<<<<< HEAD
  profileSaved: false,       // 나의 회의 프로필에서 "저장하기"를 눌렀는지
=======
  pendingMeetings: [],       // 필참자에게 제안했지만 아직 확정되지 않은 회의 (홈 화면에 노출)
  activePendingId: null,     // 지금 의견수집/합의 화면에서 다루고 있는 pendingMeetings 항목의 id
>>>>>>> feature/recommendation
};

// ============================================================================
// Date helpers — resolve the picked date into a Korean day label
// ============================================================================
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function getMonday(d) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun..6=Sat
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function daysBetweenISO(startStr, endStr) {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.round((end - start) / 86400000);
}

function resolveDayLabel(dateStr) {
  const todayStr = toISODate(new Date());
  const tomorrowStr = toISODate(addDays(new Date(), 1));
  if (dateStr === todayStr) return '오늘';
  if (dateStr === tomorrowStr) return '내일';
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일(${weekday})`;
}

// 기간으로 찾기 모드에서 각 슬롯이 실제로 배정되는 날짜 — 기간 시작일 + dayOffset을
// 기간 길이로 모듈러 연산해 항상 선택된 기간 안쪽 날짜를 가리키도록 한다.
function resolveSlotDate(slot) {
  if (state.searchMode === 'specific' || !state.periodStart || !state.periodEnd) {
    return state.meetingDate;
  }
  const totalDays = daysBetweenISO(state.periodStart, state.periodEnd) + 1;
  const offset = totalDays > 0 ? slot.dayOffset % totalDays : 0;
  const [y, m, d] = state.periodStart.split('-').map(Number);
  return toISODate(addDays(new Date(y, m - 1, d), offset));
}

function buildSlotLabel(slot) {
  return `${resolveDayLabel(resolveSlotDate(slot))} ${slot.timeRange}`;
}

// ============================================================================
// Screen 02 — 회의 목적 선택
// ============================================================================
function renderPurposeOptions() {
  const wrap = document.getElementById('purpose-grid');
  wrap.innerHTML = MEETING_PURPOSES.map(p => `
    <div class="purpose-chip">
      <input type="radio" name="purpose" id="purpose-${p.id}" value="${p.id}" ${state.purpose === p.id ? 'checked' : ''}>
      <label for="purpose-${p.id}">
        <span class="purpose-chip-icon">${p.icon}</span>
        <span class="purpose-chip-label">${p.label}</span>
        <span class="purpose-chip-desc">${p.desc}</span>
      </label>
    </div>`).join('');

  wrap.querySelectorAll('input[name="purpose"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.purpose = radio.value;
      syncAttendeeControls();
    });
  });
}

// ============================================================================
// Screen 02 — attendee list (add / remove / require-optional)
// ============================================================================
function renderAttendeeList() {
  const list = document.getElementById('attendee-list');

  if (state.selectedAttendeeIds.length === 0) {
    list.innerHTML = `
      <li class="list-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span>아직 추가된 참석자가 없어요</span>
      </li>`;
  } else {
    list.innerHTML = state.selectedAttendeeIds.map(id => {
      const a = ATTENDEES.find(p => p.id === id);
      return `
      <li class="attendee-row">
        <div class="attendee-info">
          <span class="avatar">${a.name[0]}</span>
          <span class="attendee-info-text">
            <span class="name">${a.name}</span>
            <span class="team-tag">${a.team}</span>
          </span>
        </div>
        <div class="attendee-row-actions">
<<<<<<< HEAD
          <div class="segmented" role="group" aria-label="${a.name} 참석 유형" data-person="${a.id}">
            <button type="button" class="seg-btn ${state.attendance[a.id] ? 'active' : ''}" data-value="required">필참</button>
            <button type="button" class="seg-btn ${!state.attendance[a.id] ? 'active' : ''}" data-value="optional">선택 참석</button>
          </div>
          <button type="button" class="remove-item-btn" data-person="${a.id}" aria-label="${a.name} 삭제">
=======
          <label class="required-check" for="required-${a.id}">
            <input type="checkbox" class="required-checkbox" data-person="${a.id}" id="required-${a.id}" ${state.attendance[a.id] ? 'checked' : ''}>
            <span>필참</span>
          </label>
          <button type="button" class="remove-attendee-btn" data-person="${a.id}" aria-label="${a.name} 삭제">
>>>>>>> feature/recommendation
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </li>`;
    }).join('');
  }

  list.querySelectorAll('.required-checkbox').forEach(box => {
    box.addEventListener('change', () => {
      state.attendance[box.dataset.person] = box.checked;
    });
  });

  list.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedAttendeeIds = state.selectedAttendeeIds.filter(id => id !== btn.dataset.person);
      renderAttendeeList();
      syncAttendeeControls();
    });
  });

  syncAttendeeControls();
}

function syncAttendeeControls() {
  const count = state.selectedAttendeeIds.length;
  document.getElementById('attendee-count').textContent = `${count}명`;

  const findBtn = document.getElementById('find-time-btn');
  const hint = document.getElementById('find-time-hint');
  const hasTitle = state.meetingTitle.trim().length > 0;
  const blocked = !hasTitle || count === 0 || !state.purpose;
  findBtn.disabled = blocked;
  hint.style.display = blocked ? 'block' : 'none';
  hint.textContent = !hasTitle
    ? '회의 제목을 입력하면 좋은 시간을 찾아드려요.'
    : count === 0
      ? '참석자를 1명 이상 추가하면 좋은 시간을 찾아드려요.'
      : '회의 목적을 선택하면 좋은 시간을 찾아드려요.';

  const addBtn = document.getElementById('add-attendee-btn');
  const allAdded = count >= ATTENDEES.length;
  addBtn.disabled = allAdded;
  addBtn.textContent = allAdded ? '모든 동료를 추가했어요' : '';
  if (!allAdded) {
    addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg> 참석자 추가`;
  }
}

// ============================================================================
// Attendee picker sheet (with name search)
// ============================================================================
let pickerCheckedIds = [];   // survives search filtering, unlike the DOM checkboxes
let pickerQuery = '';

function openAttendeePicker() {
  pickerCheckedIds = [...state.selectedAttendeeIds];
  pickerQuery = '';
  const searchInput = document.getElementById('picker-search');
  searchInput.value = '';
  renderPickerList();
  document.getElementById('picker-overlay').classList.add('open');
  searchInput.focus();
}

function getPickerMatches() {
  const query = pickerQuery.trim();
  return query
    ? ATTENDEES.filter(a => a.name.includes(query) || a.team.includes(query))
    : ATTENDEES;
}

function renderPickerList() {
  const pickerList = document.getElementById('picker-list');
  const matches = getPickerMatches();

  const selectAllBox = document.getElementById('picker-select-all-checkbox');
  selectAllBox.disabled = matches.length === 0;
  selectAllBox.checked = matches.length > 0 && matches.every(a => pickerCheckedIds.includes(a.id));

  if (matches.length === 0) {
    pickerList.innerHTML = `
      <div class="picker-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span>‘${pickerQuery.trim()}’와 일치하는 동료가 없어요</span>
      </div>`;
    return;
  }

  pickerList.innerHTML = matches.map(a => `
    <label class="check-item">
      <input type="checkbox" data-person="${a.id}" ${pickerCheckedIds.includes(a.id) ? 'checked' : ''}>
      <span class="avatar">${a.name[0]}</span>
      <span class="check-item-text">
        <span class="name">${a.name}</span>
        <span class="team-tag">${a.team}</span>
      </span>
    </label>
  `).join('');

  pickerList.querySelectorAll('input[type="checkbox"]').forEach(box => {
    box.addEventListener('change', () => {
      const id = box.dataset.person;
      if (box.checked) {
        if (!pickerCheckedIds.includes(id)) pickerCheckedIds.push(id);
      } else {
        pickerCheckedIds = pickerCheckedIds.filter(existing => existing !== id);
      }
    });
  });
}

document.getElementById('picker-search').addEventListener('input', (e) => {
  pickerQuery = e.target.value;
  renderPickerList();
});

document.getElementById('picker-select-all-checkbox').addEventListener('change', (e) => {
  const matches = getPickerMatches();
  if (e.target.checked) {
    matches.forEach(a => { if (!pickerCheckedIds.includes(a.id)) pickerCheckedIds.push(a.id); });
  } else {
    const matchIds = matches.map(a => a.id);
    pickerCheckedIds = pickerCheckedIds.filter(id => !matchIds.includes(id));
  }
  renderPickerList();
});

function closeAttendeePicker() {
  document.getElementById('picker-overlay').classList.remove('open');
}

document.getElementById('add-attendee-btn').addEventListener('click', openAttendeePicker);
document.getElementById('picker-close-btn').addEventListener('click', closeAttendeePicker);
document.getElementById('picker-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'picker-overlay') closeAttendeePicker();
});
document.getElementById('picker-confirm-btn').addEventListener('click', () => {
  pickerCheckedIds.forEach(id => {
    if (!(id in state.attendance)) {
      state.attendance[id] = true; // new attendees default to 필참
    }
  });
  state.selectedAttendeeIds = ATTENDEES.map(a => a.id).filter(id => pickerCheckedIds.includes(id));
  renderAttendeeList();
  closeAttendeePicker();
});

// ============================================================================
// Screen 02 — 추천 결과 (히어로 = 🥇, 대안 = 🥈🥉). 순위 + 이유가 1차 정보이고
// 점수/히트맵은 "적합도 근거 보기" 아코디언 안에서만 확인할 수 있다.
// ============================================================================
function renderAltSlots() {
  const wrap = document.getElementById('alt-slots');
  const medals = ['🥈', '🥉'];
  wrap.innerHTML = state.currentRecommendations.slice(1).map((slot, i) => {
    const reasons = buildRecommendReasons(slot, state.purpose);
    return `
    <div class="alt-card-wrap">
      <div class="alt-card" data-toggle-slot="${slot.id}" role="button" tabindex="0" aria-expanded="false" aria-controls="alt-${slot.id}-evidence">
        <div class="alt-card-left">
          <span class="rank-badge">${medals[i]}</span>
          <div>
            <span class="alt-card-time">${buildSlotLabel(slot)}</span>
            <span class="alt-card-meta">${reasons[0]}</span>
          </div>
        </div>
        <div class="alt-card-right">
          <span class="alt-card-score">${slot.score}<span> 점</span></span>
          <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <div class="evidence-panel" id="alt-${slot.id}-evidence">
        <div class="evidence-panel-inner">
          <div class="card">
            <div class="card-title">추천 이유</div>
            <ul class="reason-list">${reasons.map(r => `<li class="reason-item">${r}</li>`).join('')}</ul>
          </div>
          <div class="card">
            <div class="card-title">회의 적합도 계산 기준</div>
            <div class="criteria-list" id="alt-${slot.id}-criteria"></div>
          </div>
          <div class="card">
            <div class="card-title">참석자별 회의 적합도</div>
            <p class="card-desc">사람 중심으로 구성했어요. 각 셀을 눌러 이유를 확인하세요.</p>
            <div class="heatmap-scroll"><div class="heatmap" id="alt-${slot.id}-heatmap"></div></div>
            <div class="legend">
              <span class="legend-item"><span class="legend-dot good"></span>회의하기 좋은 시간</span>
              <span class="legend-item"><span class="legend-dot caution"></span>가능하지만 추천하지 않음</span>
              <span class="legend-item"><span class="legend-dot bad"></span>참석 어려움</span>
              <span class="legend-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="#F5A623"><path d="M12 2l2.4 7.2H22l-6 4.6 2.4 7.2L12 16.4l-6.4 4.6L8 13.8 2 9.2h7.6L12 2z"/></svg>가장 적합한 시간</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  state.currentRecommendations.slice(1).forEach(slot => {
    mountEvidence(`alt-${slot.id}`, slot);
    const header = wrap.querySelector(`.alt-card[data-toggle-slot="${slot.id}"]`);
    const panel = document.getElementById(`alt-${slot.id}-evidence`);
    header.addEventListener('click', () => toggleEvidencePanel(panel, header));
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
    });
  });
}

// 점수 배지 숫자를 0에서부터 셈업하는 마이크로 인터랙션.
function animateScoreNumber(el, target) {
  if (!el) return;
  const duration = 700;
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderHeroCard(slot) {
  const titleEl = document.getElementById('hero-meeting-title');
  titleEl.textContent = state.meetingTitle.trim();
  titleEl.style.display = state.meetingTitle.trim() ? 'block' : 'none';
  document.getElementById('hero-time').textContent = buildSlotLabel(slot);
  document.getElementById('hero-reasons').innerHTML = buildRecommendReasons(slot, state.purpose)
    .map(r => `<li class="reason-item">${r}</li>`).join('');
  document.getElementById('hero-score').innerHTML = `<span class="score-num">0</span><span class="score-unit">점</span>`;
  animateScoreNumber(document.querySelector('#hero-score .score-num'), slot.score);
  const labelEl = document.getElementById('hero-score-label');
  labelEl.textContent = slot.scoreLabel;
  labelEl.className = `score-label score-label--${scoreLabelClass(slot.score)}`;
  document.getElementById('hero-summary-message').textContent = slot.summary.message;
  document.getElementById('hero-attendance').textContent = `${slot.attendanceRate}%`;
}

document.getElementById('find-time-btn').addEventListener('click', () => {
  if (!state.meetingTitle.trim() || state.selectedAttendeeIds.length === 0 || !state.purpose) return;
  document.getElementById('meeting-form').style.display = 'none';
  document.getElementById('loading-wrap').style.display = 'flex';
  setStepper('recommend', 'create');
  setTimeout(() => {
    state.currentRecommendations = rankSlotsForPurpose(state.purpose);
    document.getElementById('loading-wrap').style.display = 'none';
    document.getElementById('meeting-results').style.display = 'block';
    renderHeroCard(state.currentRecommendations[0]);
    mountEvidence('hero', state.currentRecommendations[0]);
    renderAltSlots();
  }, 900);
});

document.getElementById('edit-attendees-btn').addEventListener('click', () => {
  document.getElementById('meeting-results').style.display = 'none';
  document.getElementById('meeting-form').style.display = 'block';
});

// "필참자에게 제안하기" — 추천은 여기서 확정되지 않는다. 필참자 응답을 모으는
// 단계로 넘어갈 뿐이다. 이 시점부터 홈 화면의 "제안 중인 회의"에도 노출된다.
document.getElementById('propose-btn').addEventListener('click', () => {
  state.requiredIds = state.selectedAttendeeIds.filter(id => state.attendance[id]);
  state.optionalIds = state.selectedAttendeeIds.filter(id => !state.attendance[id]);
  if (state.requiredIds.length === 0) {
    showToast('필참자를 1명 이상 지정해주세요.');
    return;
  }
  state.responses = {};
  state.currentRecommendations.forEach(slot => { state.responses[slot.id] = {}; });

  const pendingEntry = {
    id: Date.now(),
    title: state.meetingTitle.trim(),
    purposeId: state.purpose,
    requiredIds: [...state.requiredIds],
    optionalIds: [...state.optionalIds],
    candidates: state.currentRecommendations,
    candidateLabels: state.currentRecommendations.map(slot => buildSlotLabel(slot)), // 홈 목록용 — 이후 날짜 필터가 바뀌어도 제안 당시 시간으로 고정
    responses: state.responses, // 같은 객체를 참조 — 응답이 쌓일 때마다 자동으로 동기화된다
  };
  state.pendingMeetings.push(pendingEntry);
  state.activePendingId = pendingEntry.id;
  renderHome();

  renderCollectScreen();
  setStepper('collect', 'collect');
  showScreen('collect');
});

// 홈 화면 "제안 중인 회의" 목록에서 항목을 눌렀을 때 — 그 회의의 의견 수집 화면으로 돌아간다.
function resumePendingMeeting(id) {
  const entry = state.pendingMeetings.find(p => p.id === id);
  if (!entry) return;
  state.activePendingId = entry.id;
  state.meetingTitle = entry.title;
  state.purpose = entry.purposeId;
  state.requiredIds = entry.requiredIds;
  state.optionalIds = entry.optionalIds;
  state.currentRecommendations = entry.candidates;
  state.responses = entry.responses;
  renderCollectScreen();
  setStepper('collect', 'collect');
  showScreen('collect');
}

// Reset the creation flow to a blank slate — used whenever the user starts a brand-new meeting.
function setMeetingDate(dateStr) {
  state.meetingDate = dateStr;
  document.getElementById('meeting-date-input').value = dateStr;
  const todayStr = toISODate(new Date());
  const tomorrowStr = toISODate(addDays(new Date(), 1));
  document.getElementById('date-quick-today').checked = dateStr === todayStr;
  document.getElementById('date-quick-tomorrow').checked = dateStr === tomorrowStr;
}

document.getElementById('date-quick-today').addEventListener('change', () => setMeetingDate(toISODate(new Date())));
document.getElementById('date-quick-tomorrow').addEventListener('change', () => setMeetingDate(toISODate(addDays(new Date(), 1))));
document.getElementById('meeting-date-input').addEventListener('change', (e) => {
  if (!e.target.value) { e.target.value = state.meetingDate; return; }
  setMeetingDate(e.target.value);
});

document.getElementById('meeting-title-input').addEventListener('input', (e) => {
  state.meetingTitle = e.target.value;
  syncAttendeeControls();
});

// ============================================================================
// Screen 02 — search mode: 기간으로 찾기 (period) vs 특정 날짜 지정 (specific)
// ============================================================================
function setSearchMode(mode) {
  state.searchMode = mode;
  document.querySelectorAll('#search-mode-segmented .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.getElementById('period-fields').style.display = mode === 'period' ? 'block' : 'none';
  document.getElementById('specific-fields').style.display = mode === 'specific' ? 'block' : 'none';
}

document.querySelectorAll('#search-mode-segmented .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => setSearchMode(btn.dataset.mode));
});

function setPeriodRange(startStr, endStr) {
  state.periodStart = startStr;
  state.periodEnd = endStr;
  document.getElementById('period-start-input').value = startStr;
  document.getElementById('period-end-input').value = endStr;
}

// Quick range chips — clamp the start to today so past dates are never offered.
function setPeriodQuick(preset) {
  const today = new Date();
  const mondayThisWeek = getMonday(today);
  let start, end;
  if (preset === 'thisweek') {
    start = today;
    end = addDays(mondayThisWeek, 4);
  } else if (preset === 'nextweek') {
    start = addDays(mondayThisWeek, 7);
    end = addDays(mondayThisWeek, 11);
  } else {
    start = today;
    end = addDays(today, 6);
  }
  if (start < today) start = today;
  setPeriodRange(toISODate(start), toISODate(end));
}

document.getElementById('period-quick-thisweek').addEventListener('change', () => setPeriodQuick('thisweek'));
document.getElementById('period-quick-nextweek').addEventListener('change', () => setPeriodQuick('nextweek'));
document.getElementById('period-quick-next7').addEventListener('change', () => setPeriodQuick('next7'));

// Custom range edits no longer match a quick preset, so clear the chip selection.
function clearPeriodQuickSelection() {
  document.querySelectorAll('input[name="period-quick"]').forEach(r => { r.checked = false; });
}

document.getElementById('period-start-input').addEventListener('change', (e) => {
  if (!e.target.value) { e.target.value = state.periodStart; return; }
  state.periodStart = e.target.value;
  if (state.periodEnd < state.periodStart) {
    state.periodEnd = state.periodStart;
    document.getElementById('period-end-input').value = state.periodEnd;
  }
  clearPeriodQuickSelection();
});

document.getElementById('period-end-input').addEventListener('change', (e) => {
  if (!e.target.value) { e.target.value = state.periodEnd; return; }
  state.periodEnd = e.target.value;
  if (state.periodEnd < state.periodStart) state.periodStart = state.periodEnd;
  document.getElementById('period-start-input').value = state.periodStart;
  clearPeriodQuickSelection();
});

function resetCreateFlow() {
  state.selectedAttendeeIds = [];
  state.attendance = {};
  state.meetingTitle = '';
  document.getElementById('meeting-title-input').value = '';
  state.purpose = null;
  state.currentRecommendations = [];
  state.requiredIds = [];
  state.optionalIds = [];
  state.responses = {};
  state.activePendingId = null;
  setMeetingDate(toISODate(new Date()));
  setSearchMode('period');
  document.getElementById('period-quick-thisweek').checked = true;
  setPeriodQuick('thisweek');
  document.getElementById('duration-select').value = '1시간';
  document.getElementById('meeting-results').style.display = 'none';
  document.getElementById('loading-wrap').style.display = 'none';
  document.getElementById('meeting-form').style.display = 'block';
  renderPurposeOptions();
  setStepper('recommend', 'create');
  renderAttendeeList();

  const heroToggle = document.getElementById('hero-evidence-toggle');
  document.getElementById('hero-evidence-panel').classList.remove('open');
  heroToggle.classList.remove('open');
  heroToggle.setAttribute('aria-expanded', 'false');
  heroToggle.querySelector('.evidence-toggle-label').textContent = '적합도 근거 보기';
}

document.getElementById('new-meeting-btn').addEventListener('click', () => {
  resetCreateFlow();
  showScreen('create');
});

// ============================================================================
// Stepper (4단계: 추천 → 의견수집 → 합의 → 확정) — screen-create/collect/consensus
// 각 화면의 .stepper-step 중 현재 단계에만 .current를 준다.
// ============================================================================
function setStepper(step, screenId) {
  const scope = screenId ? document.getElementById(`screen-${screenId}`) : document;
  scope.querySelectorAll('.stepper-step').forEach(el => {
    el.classList.toggle('current', el.dataset.step === step);
  });
}

// ============================================================================
// Screen navigation
// ============================================================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === name));
  document.getElementById('screen-' + name).scrollIntoView({ block: 'start' });
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.nav));
});

// ============================================================================
// Screen 01 — calendar integration (replaces manual schedule entry)
// ============================================================================
let calendarConnected = false;

// Mock data as if imported from the connected Google Calendar.
const syncedSchedule = {
  recurring: [
    { id: 'r1', title: '외근',   weekday: '화', start: '10:00', end: '17:00', enabled: true },
    { id: 'r2', title: '팀회의', weekday: '목', start: '14:00', end: '15:00', enabled: true },
    { id: 'r3', title: '교육',   weekday: '금', start: '09:00', end: '12:00', enabled: true },
  ],
  oneTime: [
    { id: 'o1', title: '병원 예약', date: '2026-07-10', start: '14:00', end: '15:00', enabled: true },
  ],
};

function renderSyncedSchedule() {
  const list = document.getElementById('synced-schedule-list');
  const items = [
    ...syncedSchedule.recurring.map(s => ({ ...s, kind: 'recurring' })),
    ...syncedSchedule.oneTime.map(s => ({ ...s, kind: 'onetime' })),
  ];

  if (items.length === 0) {
    list.innerHTML = `
      <li class="list-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/></svg>
        <span>가져온 일정이 없어요</span>
      </li>`;
    return;
  }

  list.innerHTML = items.map(s => {
    const label = s.kind === 'recurring' ? `매주 ${s.weekday}요일 ${s.title}` : `${resolveDayLabel(s.date)} ${s.title}`;
    return `
    <div class="check-item repeat-item synced-item">
      <input type="checkbox" id="sync-${s.id}" ${s.enabled ? 'checked' : ''}>
      <label for="sync-${s.id}">${label}<span class="meta">${s.start} – ${s.end}</span></label>
      <span class="synced-tag" title="Google 캘린더에서 가져옴">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </span>
    </div>`;
  }).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.id.replace('sync-', '');
      const item = syncedSchedule.recurring.find(s => s.id === id) || syncedSchedule.oneTime.find(s => s.id === id);
      if (item) item.enabled = cb.checked;
    });
  });
}

document.getElementById('connect-calendar-btn').addEventListener('click', () => {
  document.getElementById('calendar-disconnected-state').style.display = 'none';
  document.getElementById('calendar-connecting-state').style.display = 'flex';

  setTimeout(() => {
    calendarConnected = true;
    document.getElementById('calendar-connecting-state').style.display = 'none';
    document.getElementById('calendar-connected-state').style.display = 'block';
    document.getElementById('calendar-sync-time').textContent = '방금 동기화됨';
    document.getElementById('synced-schedule-card').style.display = 'block';
    renderSyncedSchedule();
    showToast('구글 캘린더가 연동됐어요.');
    updateSetupBanner();
  }, 900);
});

document.getElementById('disconnect-calendar-btn').addEventListener('click', () => {
  calendarConnected = false;
  document.getElementById('calendar-connected-state').style.display = 'none';
  document.getElementById('synced-schedule-card').style.display = 'none';
  document.getElementById('calendar-disconnected-state').style.display = 'block';
  showToast('캘린더 연동이 해제됐어요.');
  updateSetupBanner();
});

// ============================================================================
// Screen 01 — profile save
// ============================================================================
document.getElementById('save-profile-btn').addEventListener('click', () => {
  state.profileSaved = true;
  showToast('저장했어요. 이후 회의 추천에 자동으로 반영돼요.');
  updateSetupBanner();
});

// ============================================================================
// Screen 00 — 설정 안내 배너. 캘린더 연동/프로필 저장을 아직 안 한 유저에게만 보여준다.
// ============================================================================
function updateSetupBanner() {
  const banner = document.getElementById('home-setup-banner');
  banner.style.display = (!calendarConnected || !state.profileSaved) ? 'flex' : 'none';
}

document.getElementById('home-setup-banner-btn').addEventListener('click', () => {
  showScreen('profile');
});

// ============================================================================
// Screen 03 — 필참자 의견 수집 (인터랙티브 데모: 조직자가 각 필참자 행을 눌러
// 그 사람 입장에서 응답을 시뮬레이션한다)
// ============================================================================
function deriveAttendeeLeaning(personId, slot) {
  const idx = slot.columns.indexOf(slot.recommendedCol);
  const status = slot.people[personId] && slot.people[personId].status[idx];
  return status !== 'bad';
}

function isPersonResponded(personId) {
  return state.currentRecommendations.some(slot =>
    state.responses[slot.id] && state.responses[slot.id][personId] !== undefined);
}

function summarizePersonResponse(personId) {
  const okSlots = state.currentRecommendations.filter(slot =>
    state.responses[slot.id] && state.responses[slot.id][personId] === true);
  if (okSlots.length === 0) return '참석이 어려워요';
  return okSlots.map(s => buildSlotLabel(s)).join(', ') + ' 가능';
}

function renderCollectScreen() {
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('collect-candidates').innerHTML = state.currentRecommendations.map((slot, i) => `
    <div class="mini-candidate-card">
      <span class="mini-candidate-medal">${medals[i]}</span>
      <span>${buildSlotLabel(slot)}</span>
    </div>`).join('');

  const requiredPeople = state.requiredIds.map(id => ATTENDEES.find(a => a.id === id));
  const respondedCount = requiredPeople.filter(p => isPersonResponded(p.id)).length;

  document.getElementById('collect-progress-count').textContent = `${respondedCount} / ${requiredPeople.length}`;
  const pct = requiredPeople.length ? Math.round((respondedCount / requiredPeople.length) * 100) : 0;
  document.getElementById('collect-progress-fill').style.width = `${pct}%`;
  document.getElementById('collect-deadline').textContent = state.respondDeadlineLabel;

  const listWrap = document.getElementById('collect-responder-list');
  listWrap.innerHTML = requiredPeople.map(p => {
    const responded = isPersonResponded(p.id);
    const summary = responded ? summarizePersonResponse(p.id) : '아직 응답하지 않았어요';
    return `
      <li class="responder-row ${responded ? 'responded' : ''}" data-person="${p.id}">
        <div class="attendee-info">
          <span class="avatar">${p.name[0]}</span>
          <div>
            <div class="name">${p.name}</div>
            <div class="responder-summary">${p.team} · ${summary}</div>
          </div>
        </div>
        <span class="status-chip ${responded ? 'status-chip--done' : 'status-chip--pending'}">${responded ? '응답 완료' : '미응답'}</span>
      </li>`;
  }).join('');

  listWrap.querySelectorAll('.responder-row').forEach(row => {
    row.addEventListener('click', () => openRespondSheetForPerson(row.dataset.person));
  });
}

document.getElementById('collect-remind-btn').addEventListener('click', () => {
  showToast('미응답 필참자에게 리마인드를 보냈어요.');
});

document.getElementById('collect-done-btn').addEventListener('click', () => {
  renderConsensusScreen();
  setStepper('consensus', 'consensus');
  showScreen('consensus');
});

// ---- 응답 시뮬레이션 바텀시트 ----
// 두 군데에서 재사용한다: (1) 조직자가 의견 수집 화면에서 특정 필참자 입장을 시뮬레이션할 때,
// (2) 홈 화면 "나에게 온 제안"에 내가 직접 응답할 때. 항상 회의 제목 → 참석자 → 후보 시간
// → 제출 순서로 보여준다.
function openRespondSheetForPerson(personId) {
  const person = ATTENDEES.find(a => a.id === personId);
  const candidates = state.currentRecommendations;
  const checked = candidates.map(slot => {
    const existing = state.responses[slot.id] && state.responses[slot.id][personId];
    return existing !== undefined ? existing : deriveAttendeeLeaning(personId, slot);
  });
  const allBad = candidates.every(slot => !deriveAttendeeLeaning(personId, slot));
  const participantIds = [...new Set([...state.requiredIds, ...state.optionalIds])];

  openRespondSheet({
    heading: `${person.name}님으로 응답해보기 (데모)`,
    meetingTitle: state.meetingTitle.trim() || '(제목 없는 회의)',
    participants: participantIds.map(id => ATTENDEES.find(a => a.id === id)),
    candidateLabels: candidates.map(slot => buildSlotLabel(slot)),
    checked,
    declined: allBad,
    onSubmit: ({ declined, checkedIndexes }) => {
      candidates.forEach((slot, i) => {
        if (!state.responses[slot.id]) state.responses[slot.id] = {};
        state.responses[slot.id][personId] = declined ? false : checkedIndexes.includes(i);
      });
      showToast(`${person.name}님이 응답했어요.`);
      renderCollectScreen();
    },
  });
}

// 홈 화면 "나에게 온 제안" 더미 초대에 응답한다.
function openIncomingInviteSheet() {
  const organizer = ATTENDEES.find(a => a.id === INCOMING_INVITE.organizerId);
  const existing = state.incomingInviteResponse;

  openRespondSheet({
    heading: `${organizer.name}님이 보낸 제안에 응답하기`,
    meetingTitle: INCOMING_INVITE.title,
    participants: INCOMING_INVITE.participantIds.map(id => ATTENDEES.find(a => a.id === id)),
    candidateLabels: INCOMING_INVITE.candidateLabels,
    checked: INCOMING_INVITE.candidateLabels.map((_, i) => existing ? existing.checkedIndexes.includes(i) : true),
    declined: existing ? existing.declined : false,
    onSubmit: (result) => {
      state.incomingInviteResponse = result;
      showToast('응답을 제출했어요.');
      renderHome();
    },
  });
}

// opts: { heading, meetingTitle, participants:[{name}], candidateLabels:[string], checked:[bool],
//         declined: bool, onSubmit({declined, checkedIndexes}) }
function openRespondSheet(opts) {
  state.activeRespondConfig = opts;

  document.getElementById('respond-sheet-title').textContent = opts.heading;
  document.getElementById('respond-meeting-title').textContent = opts.meetingTitle;
  document.getElementById('respond-meeting-attendees').innerHTML = opts.participants.map(p => `
    <span class="respond-attendee-chip"><span class="avatar">${p.name[0]}</span>${p.name}</span>
  `).join('');

  const optionsWrap = document.getElementById('respond-sheet-options');
  optionsWrap.innerHTML = opts.candidateLabels.map((label, i) => `
      <label class="check-item">
        <input type="checkbox" class="respond-slot-checkbox" data-index="${i}" ${opts.checked[i] ? 'checked' : ''}>
        <span>${label}</span>
      </label>`).join('');

  document.getElementById('respond-decline-checkbox').checked = opts.declined;
  syncRespondSheetState();

  optionsWrap.querySelectorAll('.respond-slot-checkbox').forEach(box => {
    box.addEventListener('change', () => {
      if (box.checked) document.getElementById('respond-decline-checkbox').checked = false;
      syncRespondSheetState();
    });
  });

  document.getElementById('respond-sheet-overlay').classList.add('open');
}

function syncRespondSheetState() {
  const declineBox = document.getElementById('respond-decline-checkbox');
  document.querySelectorAll('.respond-slot-checkbox').forEach(box => {
    box.disabled = declineBox.checked;
    if (declineBox.checked) box.checked = false;
  });
}

document.getElementById('respond-decline-checkbox').addEventListener('change', syncRespondSheetState);

function closeRespondSheet() {
  document.getElementById('respond-sheet-overlay').classList.remove('open');
}

document.getElementById('respond-sheet-close-btn').addEventListener('click', closeRespondSheet);
document.getElementById('respond-sheet-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'respond-sheet-overlay') closeRespondSheet();
});

document.getElementById('respond-submit-btn').addEventListener('click', () => {
  const opts = state.activeRespondConfig;
  const declineBox = document.getElementById('respond-decline-checkbox');
  const result = declineBox.checked
    ? { declined: true, checkedIndexes: [] }
    : {
      declined: false,
      checkedIndexes: Array.from(document.querySelectorAll('.respond-slot-checkbox'))
        .filter(box => box.checked)
        .map(box => Number(box.dataset.index)),
    };
  closeRespondSheet();
  opts.onSubmit(result);
});

// ============================================================================
// Screen 04 — MeetFit 합의 결과
// ============================================================================
function computeConsensus(recommendations, requiredIds) {
  return recommendations.map(slot => {
    const available = requiredIds.filter(id => state.responses[slot.id] && state.responses[slot.id][id] === true);
    return {
      slot,
      requiredTotal: requiredIds.length,
      availableCount: available.length,
    };
  }).sort((a, b) => {
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
    return b.slot.score - a.slot.score;
  });
}

function buildConsensusReasons(entry, purposeId) {
  const purpose = MEETING_PURPOSES.find(p => p.id === purposeId) || MEETING_PURPOSES[0];
  const reasons = [];
  reasons.push(entry.availableCount === entry.requiredTotal
    ? '모든 필참자가 선택한 시간입니다.'
    : `필참자 ${entry.availableCount}/${entry.requiredTotal}명이 선택한 시간입니다.`);
  reasons.push(`회의 목적(${purpose.label})에 적합합니다.`);
  reasons.push('업무 흐름 영향이 적습니다.');
  if (entry.slot.scoreInput.travelBuffer >= 15) reasons.push('이동시간을 확보했습니다.');
  return reasons.slice(0, 4);
}

function buildConsensusExclusionReasons(entry) {
  const reasons = [];
  const missing = entry.requiredTotal - entry.availableCount;
  if (missing > 0) reasons.push(`필참자 ${missing}명 불가`);
  reasons.push(...buildExclusionReasons(entry.slot).filter(r => !r.startsWith('필참자')));
  return reasons.slice(0, 3);
}

function renderConsensusScreen() {
  const consensus = computeConsensus(state.currentRecommendations, state.requiredIds);
  state.consensusResult = consensus;
  const top = consensus[0];
  const medals = ['🏆', '🥈', '🥉'];

  document.getElementById('consensus-time').textContent = buildSlotLabel(top.slot);
  document.getElementById('consensus-attendance').textContent = `${top.availableCount} / ${top.requiredTotal}`;
  document.getElementById('consensus-reasons').innerHTML = buildConsensusReasons(top, state.purpose)
    .map(r => `<li class="reason-item">${r}</li>`).join('');
  mountEvidence('consensus', top.slot);

  document.getElementById('consensus-candidate-list').innerHTML = consensus.map((entry, i) => {
    const statusText = entry.requiredTotal === 0
      ? '필참자 없음'
      : entry.availableCount === entry.requiredTotal
        ? '필참 전원 가능'
        : entry.availableCount === 0
          ? '참석률 낮음'
          : `필참 ${entry.requiredTotal - entry.availableCount}명 확인 필요`;
    return `
      <div class="consensus-card ${i === 0 ? 'top' : ''}">
        <span class="rank-badge">${medals[i] || '·'}</span>
        <div class="consensus-card-body">
          <span class="consensus-card-time">${buildSlotLabel(entry.slot)}</span>
          <span class="consensus-card-status">${statusText}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('consensus-exclusions').innerHTML = consensus.slice(1).map(entry => `
    <div class="exclusion-item">
      <p class="exclusion-question">왜 ${buildSlotLabel(entry.slot)}이 아닌가요?</p>
      <ul class="reason-list muted">${buildConsensusExclusionReasons(entry).map(r => `<li class="reason-item">${r}</li>`).join('')}</ul>
    </div>`).join('');

  document.getElementById('consensus-confirm-btn').dataset.slot = top.slot.id;
}

document.getElementById('consensus-evidence-toggle').addEventListener('click', function () {
  toggleEvidencePanel(document.getElementById('consensus-evidence-panel'), this);
});

document.getElementById('consensus-confirm-btn').addEventListener('click', function () {
  const slotId = Number(this.dataset.slot);
  const slot = state.currentRecommendations.find(s => s.id === slotId);
  confirmBooking(slot);
});

// ============================================================================
// Screen 06 — booking detail (date/attendees lead, suitability is secondary)
// ============================================================================
function buildAttendeeSummaryHtml(attendeeIds) {
  const people = attendeeIds.map(id => ATTENDEES.find(a => a.id === id));
  const avatars = people.map(p => `<span class="avatar">${p.name[0]}</span>`).join('');
  return `
    <div class="avatar-stack avatar-stack-lg">${avatars}</div>
    <span class="booking-summary-names">${people.map(p => p.name).join(', ')}</span>`;
}

function renderDetail(booking) {
  state.activeBooking = booking;
  const slot = booking.slot;

  const titleEl = document.getElementById('detail-meeting-title');
  titleEl.textContent = booking.title;
  titleEl.style.display = booking.title ? 'block' : 'none';

  document.getElementById('detail-time').textContent = booking.label;
  document.getElementById('detail-purpose-chip').textContent = booking.purpose.label;
  document.getElementById('detail-attendees').innerHTML = buildAttendeeSummaryHtml(booking.attendeeIds);

  document.getElementById('detail-required-summary').textContent = booking.requiredIds.length === 0
    ? '필참자 없음'
    : booking.requiredSummary.available === booking.requiredSummary.total
      ? `필참 전원 확정 (${booking.requiredSummary.total}명)`
      : `필참 ${booking.requiredSummary.available}/${booking.requiredSummary.total}명 확정`;

  renderOptionalList(booking);

  document.getElementById('detail-reason-text').textContent =
    `이번 회의는 ${booking.purpose.emphasis}과 필참자의 합의를 가장 우선하여 추천되었어요.`;

  document.getElementById('detail-history').innerHTML = HISTORY_STEPS.map(step => `
    <div class="history-step">
      <span class="history-step-dot">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="history-step-label">${step.label}</span>
    </div>`).join('');

  document.getElementById('detail-score').innerHTML = `<span class="score-num">0</span><span class="score-unit">점</span>`;
  animateScoreNumber(document.querySelector('#detail-score .score-num'), slot.score);
  const labelEl = document.getElementById('detail-score-label');
  labelEl.textContent = slot.scoreLabel;
  labelEl.className = `score-label score-label--${scoreLabelClass(slot.score)}`;
  document.getElementById('detail-desc').textContent = slot.summary.message;

  document.getElementById('criteria-list').innerHTML = buildScoreBreakdownHtml(slot.detail, slot.weights);
  mountHeatmap(document.getElementById('heatmap'), slot);
}

function renderOptionalList(booking) {
  const wrap = document.getElementById('detail-optional-list');
  if (booking.optionalIds.length === 0) {
    wrap.innerHTML = `<li class="attendee-empty">선택 참석자가 없어요</li>`;
    document.getElementById('detail-optional-summary').textContent = '';
    return;
  }

  const accepted = booking.optionalIds.filter(id => booking.optionalStatus[id] === 'accepted');
  const declined = booking.optionalIds.filter(id => booking.optionalStatus[id] === 'declined');
  const pending = booking.optionalIds.filter(id => booking.optionalStatus[id] === 'pending');
  document.getElementById('detail-optional-summary').textContent =
    `${accepted.length}명 참석 · ${declined.length}명 불참 · ${pending.length}명 미응답`;

  wrap.innerHTML = booking.optionalIds.map(id => {
    const person = ATTENDEES.find(a => a.id === id);
    const status = booking.optionalStatus[id];
    const label = status === 'accepted' ? '참석' : status === 'declined' ? '불참' : '미응답';
    const statusClass = status === 'accepted' ? 'status-chip--done' : status === 'declined' ? 'status-chip--declined' : 'status-chip--pending';
    return `
      <li class="responder-row ${status !== 'pending' ? 'responded' : ''}" data-person="${id}">
        <div class="attendee-info">
          <span class="avatar">${person.name[0]}</span>
          <span class="attendee-info-text">
            <span class="name">${person.name}</span>
            <span class="team-tag">${person.team}</span>
          </span>
        </div>
        <span class="status-chip ${statusClass}">${label}</span>
      </li>`;
  }).join('');

  wrap.querySelectorAll('.responder-row').forEach(row => {
    row.addEventListener('click', () => {
      if (booking.optionalStatus[row.dataset.person] === 'pending') openOptinSheet(row.dataset.person);
    });
  });
}

// ---- 선택 참석자 알림 시트 (데모: 회의 확정 후 참석 여부만 시뮬레이션) ----
function openOptinSheet(personId) {
  state.activeRespondPersonId = personId;
  const person = ATTENDEES.find(a => a.id === personId);
  document.getElementById('optin-sheet-avatar').textContent = person.name[0];
  document.getElementById('optin-sheet-name').textContent = person.name;
  document.getElementById('optin-sheet-time').textContent = state.activeBooking.label;
  document.getElementById('optin-sheet-overlay').classList.add('open');
}

function closeOptinSheet() {
  document.getElementById('optin-sheet-overlay').classList.remove('open');
}

document.getElementById('optin-sheet-close-btn').addEventListener('click', closeOptinSheet);
document.getElementById('optin-sheet-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'optin-sheet-overlay') closeOptinSheet();
});

function respondOptin(status) {
  const booking = state.activeBooking;
  const personId = state.activeRespondPersonId;
  booking.optionalStatus[personId] = status;
  closeOptinSheet();
  const person = ATTENDEES.find(a => a.id === personId);
  showToast(`${person.name}님이 ${status === 'accepted' ? '참석' : '불참'}으로 응답했어요.`);
  renderOptionalList(booking);
}

document.getElementById('optin-accept-btn').addEventListener('click', () => respondOptin('accepted'));
document.getElementById('optin-decline-btn').addEventListener('click', () => respondOptin('declined'));

document.getElementById('detail-evidence-toggle').addEventListener('click', function () {
  toggleEvidencePanel(document.getElementById('detail-evidence-panel'), this);
});

function buildHeatmapHtml(slot) {
  let html = `<div></div>`; // top-left empty corner
  slot.columns.forEach(col => {
    const isRec = col === slot.recommendedCol;
    html += `
      <div class="heatmap-cell-header ${isRec ? 'recommended' : ''}">
        ${isRec ? '<svg class="heatmap-star" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2H22l-6 4.6 2.4 7.2L12 16.4l-6.4 4.6L8 13.8 2 9.2h7.6L12 2z"/></svg>' : ''}
        <span>${col}</span>
      </div>`;
  });

  ATTENDEES.forEach(person => {
    html += `<div class="heatmap-row-label"><span class="avatar">${person.name[0]}</span>${person.name}</div>`;
    const p = slot.people[person.id];
    slot.columns.forEach((col, i) => {
      const status = p.status[i];
      const isRec = col === slot.recommendedCol;
      html += `
        <button type="button" class="heatmap-cell ${status} ${isRec ? 'recommended-col' : ''}"
          data-person="${person.id}" data-slot="${slot.id}" aria-label="${person.name} ${col} ${statusLabel(status)}">
          <span class="dot"></span>
        </button>`;
    });
  });
  return html;
}

function mountHeatmap(container, slot) {
  container.style.setProperty('--cols', slot.columns.length);
  container.innerHTML = buildHeatmapHtml(slot);
  container.querySelectorAll('.heatmap-cell').forEach(cell => {
    cell.addEventListener('click', () => openPersonSheet(cell.dataset.person, Number(cell.dataset.slot)));
  });
}

// Fills the criteria + heatmap for an inline accordion, given an id prefix
// (e.g. 'hero' or 'alt-2') matching '#{prefix}-criteria' / '#{prefix}-heatmap'.
function mountEvidence(prefix, slot) {
  document.getElementById(`${prefix}-criteria`).innerHTML = buildScoreBreakdownHtml(slot.detail, slot.weights);
  mountHeatmap(document.getElementById(`${prefix}-heatmap`), slot);
}

function toggleEvidencePanel(panel, toggleEl) {
  const isOpen = panel.classList.toggle('open');
  toggleEl.classList.toggle('open', isOpen);
  toggleEl.setAttribute('aria-expanded', String(isOpen));
  const label = toggleEl.querySelector('.evidence-toggle-label');
  if (label) label.textContent = isOpen ? '적합도 근거 접기' : '적합도 근거 보기';
}

document.getElementById('hero-evidence-toggle').addEventListener('click', function () {
  toggleEvidencePanel(document.getElementById('hero-evidence-panel'), this);
});

function statusLabel(status) {
  return status === 'good' ? '회의하기 좋음' : status === 'caution' ? '가능하지만 비추천' : '참석 어려움';
}

// ============================================================================
// Person detail sheet
// ============================================================================
function openPersonSheet(personId, slotId) {
  const slot = SLOTS.find(s => s.id === slotId);
  const person = ATTENDEES.find(a => a.id === personId);
  const data = slot.people[personId];

  document.getElementById('sheet-avatar').textContent = person.name[0];
  document.getElementById('sheet-name').textContent = person.name;
  document.getElementById('sheet-team').textContent = person.team;
  document.getElementById('sheet-score').textContent = data.score;
  const tag = document.getElementById('sheet-tag');
  tag.textContent = data.tag;
  tag.className = `score-label score-label--${data.tagClass}`;
  document.getElementById('sheet-reasons').innerHTML = data.reasons.map(r => `<div class="sheet-reason">${r}</div>`).join('');

  document.getElementById('sheet-overlay').classList.add('open');
}

function closePersonSheet() {
  document.getElementById('sheet-overlay').classList.remove('open');
}

document.getElementById('sheet-close-btn').addEventListener('click', closePersonSheet);
document.getElementById('sheet-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'sheet-overlay') closePersonSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePersonSheet();
    closeConfirmDialog();
    closeRespondSheet();
    closeOptinSheet();
  }
});

// ============================================================================
// 회의 확정 — MeetFit 합의 결과 화면에서만 호출된다 (추천 단계에서는 예약이
// 일어나지 않는다). 확정 후에는 홈이 아니라 회의 상세 화면으로 바로 이동한다.
// ============================================================================
function confirmBooking(slot) {
  const attendeeIds = state.selectedAttendeeIds.length ? [...state.selectedAttendeeIds] : Object.keys(slot.people);
  const label = buildSlotLabel(slot); // snapshot — the date picker may change after this
  const purpose = MEETING_PURPOSES.find(p => p.id === state.purpose) || MEETING_PURPOSES[0];

  const consensusEntry = state.consensusResult.find(e => e.slot.id === slot.id);
  const requiredSummary = consensusEntry
    ? { available: consensusEntry.availableCount, total: consensusEntry.requiredTotal }
    : { available: state.requiredIds.length, total: state.requiredIds.length };

  const optionalStatus = {};
  state.optionalIds.forEach(id => { optionalStatus[id] = 'pending'; });

  const booking = {
    id: Date.now(),
    title: state.meetingTitle.trim(),
    slot,
    attendeeIds,
    label,
    purpose,
    requiredIds: [...state.requiredIds],
    optionalIds: [...state.optionalIds],
    optionalStatus,
    requiredSummary,
  };

  state.bookings.push(booking);
  state.pendingMeetings = state.pendingMeetings.filter(p => p.id !== state.activePendingId);
  showToast(`${label} 회의가 확정됐어요.`);
  resetCreateFlow();
  renderHome();
  renderDetail(booking);
  showScreen('detail');
}

document.getElementById('detail-back-btn').addEventListener('click', () => {
  showScreen('home');
});

// Reschedule: drop the current booking but carry its attendees + purpose into a fresh search.
document.getElementById('detail-reschedule-btn').addEventListener('click', () => {
  const booking = state.activeBooking;
  state.bookings = state.bookings.filter(b => b.id !== booking.id);
  resetCreateFlow();
  state.selectedAttendeeIds = [...booking.attendeeIds];
  state.purpose = booking.purpose.id;
  booking.attendeeIds.forEach(id => {
    state.attendance[id] = booking.requiredIds.includes(id);
  });
  renderPurposeOptions();
  renderAttendeeList();
  renderHome();
  showToast('참석자와 회의 목적은 그대로 뒀어요. 새 시간을 찾아보세요.');
  showScreen('create');
});

// Cancel booking — destructive, so confirm first.
document.getElementById('detail-cancel-btn').addEventListener('click', () => {
  document.getElementById('confirm-dialog-overlay').classList.add('open');
});

function closeConfirmDialog() {
  document.getElementById('confirm-dialog-overlay').classList.remove('open');
}

document.getElementById('confirm-dialog-dismiss').addEventListener('click', closeConfirmDialog);
document.getElementById('confirm-dialog-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'confirm-dialog-overlay') closeConfirmDialog();
});
document.getElementById('confirm-dialog-confirm').addEventListener('click', () => {
  const booking = state.activeBooking;
  state.bookings = state.bookings.filter(b => b.id !== booking.id);
  closeConfirmDialog();
  showToast('예약이 취소됐어요.');
  renderHome();
  showScreen('home');
});

// ============================================================================
// Toast
// ============================================================================
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12l5 5L20 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

// ============================================================================
// Screen 00 — Home (upcoming / past meeting lists)
// ============================================================================
function avatarStackHtml(ids) {
  return `
    <div class="avatar-stack">
      ${ids.slice(0, 4).map(id => `<span class="avatar">${ATTENDEES.find(a => a.id === id).name[0]}</span>`).join('')}
    </div>
    <span class="meeting-item-count">${ids.length}명</span>`;
}

// 다른 사람이 나를 필참자로 초대한 회의 — 더미 데이터(INCOMING_INVITE) 하나로
// 카드 → 응답 시트(제목·참석자·후보 시간·제출) 흐름을 미리 확인할 수 있게 한다.
function renderIncomingList() {
  const section = document.getElementById('incoming-section');
  const wrap = document.getElementById('incoming-list');

  // 응답을 보내면 홈에서 바로 사라진다 — 더 이상 내가 할 일이 없는 항목이니까.
  if (state.incomingInviteResponse) {
    section.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  const organizer = ATTENDEES.find(a => a.id === INCOMING_INVITE.organizerId);
  const otherCount = INCOMING_INVITE.candidateLabels.length - 1;

  section.style.display = 'block';
  wrap.innerHTML = `
    <div class="meeting-item pending" id="incoming-invite-item">
      <div class="meeting-item-left">
        <span class="meeting-item-time">${INCOMING_INVITE.title}</span>
        <span class="meeting-item-count">${organizer.name}님의 제안 · ${INCOMING_INVITE.candidateLabels[0]}${otherCount > 0 ? ` 외 ${otherCount}건` : ''}</span>
        <div class="meeting-item-attendees">${avatarStackHtml(INCOMING_INVITE.participantIds)}</div>
      </div>
      <div class="meeting-item-right">
        <span class="status-chip status-chip--pending">응답 필요</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>`;

  document.getElementById('incoming-invite-item').addEventListener('click', openIncomingInviteSheet);
}

// 필참자에게 제안했지만 아직 확정되지 않은 회의 — 응답 진행 상황과 함께 보여주고,
// 누르면 의견 수집 화면으로 돌아가 이어서 진행할 수 있다.
function renderPendingList() {
  const section = document.getElementById('pending-section');
  const wrap = document.getElementById('pending-list');

  if (state.pendingMeetings.length === 0) {
    section.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  wrap.innerHTML = state.pendingMeetings.slice().reverse().map((p, i) => {
    const respondedCount = p.requiredIds.filter(id =>
      p.candidates.some(slot => p.responses[slot.id] && p.responses[slot.id][id] !== undefined)
    ).length;
    const otherCount = p.candidateLabels.length - 1;
    const timeCaption = `${p.candidateLabels[0]}${otherCount > 0 ? ` 외 ${otherCount}건` : ''}`;
    return `
      <div class="meeting-item pending" data-pending="${p.id}" style="animation-delay:${i * 45}ms">
        <div class="meeting-item-left">
          <span class="meeting-item-time">${p.title || timeCaption}</span>
          ${p.title ? `<span class="meeting-item-count">${timeCaption}</span>` : ''}
          <div class="meeting-item-attendees">${avatarStackHtml(p.requiredIds)}</div>
        </div>
        <div class="meeting-item-right">
          <span class="status-chip status-chip--pending">응답 ${respondedCount}/${p.requiredIds.length}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.meeting-item.pending').forEach(item => {
    item.addEventListener('click', () => resumePendingMeeting(Number(item.dataset.pending)));
  });
}

function renderHome() {
<<<<<<< HEAD
  updateSetupBanner();
=======
  renderIncomingList();
  renderPendingList();
>>>>>>> feature/recommendation
  const upcomingWrap = document.getElementById('upcoming-list');
  if (state.bookings.length === 0) {
    upcomingWrap.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/></svg>
        </span>
        <p class="empty-state-title">아직 예정된 회의가 없어요</p>
        <p class="empty-state-desc">참석자를 선택하면 회의하기 좋은 시간을 찾아드려요.</p>
        <button class="btn btn-primary" id="empty-new-meeting-btn">새 회의 예약하기</button>
      </div>`;
    document.getElementById('empty-new-meeting-btn').addEventListener('click', () => {
      resetCreateFlow();
      showScreen('create');
    });
  } else {
    upcomingWrap.innerHTML = state.bookings.slice().reverse().map((b, i) => `
      <div class="meeting-item" data-booking="${b.id}" style="animation-delay:${i * 45}ms">
        <div class="meeting-item-left">
          <span class="meeting-item-time">${b.label}</span>
          <div class="meeting-item-attendees">${avatarStackHtml(b.attendeeIds)}</div>
        </div>
        <div class="meeting-item-right">
          <span class="meeting-item-done-tag">확정 완료</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>`
    ).join('');

    upcomingWrap.querySelectorAll('.meeting-item').forEach(item => {
      item.addEventListener('click', () => {
        const booking = state.bookings.find(b => b.id === Number(item.dataset.booking));
        renderDetail(booking);
        showScreen('detail');
      });
    });
  }

  const pastWrap = document.getElementById('past-list');
  pastWrap.innerHTML = PAST_MEETINGS.map((m, i) => `
    <div class="meeting-item past" style="animation-delay:${i * 45}ms">
      <div class="meeting-item-left">
        <span class="meeting-item-time">${m.dateLabel}</span>
        <div class="meeting-item-attendees">${avatarStackHtml(m.attendeeIds)}</div>
      </div>
      <div class="meeting-item-right">
        <span class="meeting-item-done-tag">완료</span>
      </div>
    </div>
  `).join('');
}

// ============================================================================
// Auth — 로그인 / 회원가입 (프로토타입: 실제 인증 서버 없이 화면만 전환)
// ============================================================================
function setAuthTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';

  const switchText = document.getElementById('auth-switch-text');
  switchText.innerHTML = tab === 'login'
    ? '계정이 없으신가요? <button type="button" class="auth-switch-link" id="auth-switch-btn">회원가입</button>'
    : '이미 계정이 있으신가요? <button type="button" class="auth-switch-link" id="auth-switch-btn">로그인</button>';
  document.getElementById('auth-switch-btn').addEventListener('click', () => setAuthTab(tab === 'login' ? 'signup' : 'login'));
}

document.getElementById('auth-switch-btn').addEventListener('click', () => setAuthTab('signup'));

function completeLogin({ name, email } = {}) {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';

  const displayName = name || (email ? email.split('@')[0] : '나');
  document.querySelector('.user-name').textContent = displayName;
  if (email) document.querySelector('.user-email').textContent = email;
  document.querySelector('.user-avatar').textContent = displayName[0].toUpperCase();

  showToast('로그인됐어요.');
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  completeLogin({ email: document.getElementById('login-email').value.trim() });
});

document.getElementById('signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const password = document.getElementById('signup-password').value;
  const passwordConfirm = document.getElementById('signup-password-confirm').value;
  if (password !== passwordConfirm) {
    showToast('비밀번호가 일치하지 않아요.');
    return;
  }
  completeLogin({
    name: document.getElementById('signup-name').value.trim(),
    email: document.getElementById('signup-email').value.trim(),
  });
});

document.getElementById('google-login-btn').addEventListener('click', () => {
  completeLogin({ name: 'Google 사용자', email: 'you@gmail.com' });
});
document.getElementById('kakao-login-btn').addEventListener('click', () => {
  completeLogin({ name: '카카오 사용자', email: 'kakao_user@kakao.com' });
});

// ============================================================================
// Init
// ============================================================================
document.getElementById('meeting-date-input').min = toISODate(new Date());
document.getElementById('period-start-input').min = toISODate(new Date());
document.getElementById('period-end-input').min = toISODate(new Date());
setMeetingDate(toISODate(new Date()));
setSearchMode('period');
document.getElementById('period-quick-thisweek').checked = true;
setPeriodQuick('thisweek');
renderPurposeOptions();
renderAttendeeList();
renderHome();
