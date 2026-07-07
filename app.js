// ============================================================================
// Data
// ============================================================================
const ATTENDEES = [
  { id: 'minsu', name: '민수' },
  { id: 'younghee', name: '영희' },
  { id: 'chulsoo', name: '철수' },
  { id: 'jieun', name: '지은' },
  { id: 'suhyun', name: '수현' },
  { id: 'daeun', name: '다은' },
];

// ============================================================================
// Meeting suitability scoring engine
//
// The 100-point score is a sum of independently-computed factors. Each
// getXScore() takes plain inputs and returns points on its own scale, so any
// one factor can be re-tuned or unit-tested without touching the others.
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

function getRequiredScore(required, available) {
  const ratio = required === 0 ? 1 : available / required;
  if (ratio === 1) return SCORE_WEIGHTS.requiredAttendees;
  if (ratio >= 0.7) return Math.round(SCORE_WEIGHTS.requiredAttendees / 2);
  return 0;
}

function getAttendanceScore(total, available) {
  return Math.round((available / total) * SCORE_WEIGHTS.attendanceRate);
}

function getPreferenceScore(total, matched) {
  return Math.round((matched / total) * SCORE_WEIGHTS.preference);
}

function getContextScore(context) {
  let score = SCORE_WEIGHTS.workContext;
  if (context.afterLunch) score -= 3;
  if (context.focusTime) score -= 5;
  if (context.afterBusinessTrip) score -= 4;
  if (context.backToBackMeeting) score -= 3;
  return Math.max(score, 0);
}

function getFatigueScore(minutesBetweenMeetings) {
  if (minutesBetweenMeetings >= 60) return 5;
  if (minutesBetweenMeetings >= 30) return 3;
  if (minutesBetweenMeetings >= 15) return 2;
  return 0;
}

function getTravelScore(buffer) {
  if (buffer >= 15) return 5;
  if (buffer >= 10) return 3;
  return 0;
}

function calculateMeetingScore(input) {
  const requiredScore = getRequiredScore(input.requiredCount, input.requiredAvailable);
  const attendanceScore = getAttendanceScore(input.totalCount, input.availableCount);
  const preferenceScore = getPreferenceScore(input.totalCount, input.preferenceMatched);
  const contextScore = getContextScore(input.context);
  const fatigueScore = getFatigueScore(input.breakMinutes);
  const travelScore = getTravelScore(input.travelBuffer);

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
    key: 'requiredScore', label: '필참 참석', max: SCORE_WEIGHTS.requiredAttendees,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M3 19c.7-3 3-5 6-5s5.3 2 6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="8" r="2.6" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 14.2c2.5.4 4 2.1 4.5 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'attendanceScore', label: '참석률', max: SCORE_WEIGHTS.attendanceRate,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    key: 'preferenceScore', label: '개인 선호', max: SCORE_WEIGHTS.preference,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5h.01M15.5 10.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 14.5c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'contextScore', label: '업무 맥락', max: SCORE_WEIGHTS.workContext,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.8"/></svg>'
  },
  {
    key: 'fatigueScore', label: '여유 시간', max: SCORE_WEIGHTS.fatigue,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="2" y="8" width="18" height="8" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M22 10.5v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  },
  {
    key: 'travelScore', label: '이동 시간', max: SCORE_WEIGHTS.travelBuffer,
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 1118.5 10c0 5.2-6.5 11-6.5 11z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/></svg>'
  },
];

function buildScoreBreakdownHtml(detail) {
  return SCORE_BREAKDOWN_META.map(meta => {
    const value = detail[meta.key];
    const pct = Math.round((value / meta.max) * 100);
    return `
      <div class="score-row">
        <span class="score-row-icon">${meta.icon}</span>
        <span class="score-row-label">${meta.label}</span>
        <span class="score-row-bar"><span class="score-row-fill" style="width:${pct}%"></span></span>
        <span class="score-row-value">${value}<span class="score-row-max">/${meta.max}</span></span>
      </div>`;
  }).join('');
}

// Full hand-authored heatmap + reasons for the top recommendation (slot 1),
// matching the brief's worked example. Slots 2–3 are generated proportionally
// to their scores so the grid stays internally consistent (color always
// matches the underlying score). Each slot's own `score` is computed by
// calculateMeetingScore() from scoreInput below, never hardcoded.
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

// Compute each slot's score from its scoreInput (never hardcoded), then keep
// the highest-scoring slot first so the hero card always shows the best option.
SLOTS.forEach(slot => {
  const { total, detail } = calculateMeetingScore(slot.scoreInput);
  slot.score = total;
  slot.detail = detail;
  slot.summary = getMeetingSummary(total);
  slot.scoreLabel = slot.summary.title;
  slot.attendanceRate = Math.round((slot.scoreInput.availableCount / slot.scoreInput.totalCount) * 100);
});
SLOTS.sort((a, b) => b.score - a.score);

const PAST_MEETINGS = [
  { dateLabel: '어제 오후 3:00 – 4:00', attendeeIds: ['minsu', 'younghee', 'chulsoo'] },
  { dateLabel: '7월 3일 오전 11:00 – 12:00', attendeeIds: ['jieun', 'suhyun', 'daeun', 'minsu'] },
];

// ============================================================================
// State
// ============================================================================
const state = {
  selectedAttendeeIds: [],   // ids currently added to the meeting being created
  attendance: {},            // id -> true(필참) / false(선택 참석)
  meetingDate: '',           // ISO date (YYYY-MM-DD) currently selected on Screen 02 (특정 날짜 지정 모드)
  searchMode: 'period',      // 'period'(기간으로 찾기) | 'specific'(특정 날짜 지정)
  periodStart: '',           // ISO date — 기간으로 찾기 모드의 시작일
  periodEnd: '',             // ISO date — 기간으로 찾기 모드의 종료일
  activeBooking: null,       // the booking currently shown on Screen 03
  bookings: [],              // confirmed upcoming meetings
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
// Screen 02 — attendee list (add / remove / require-optional)
// ============================================================================
function renderAttendeeList() {
  const list = document.getElementById('attendee-list');

  if (state.selectedAttendeeIds.length === 0) {
    list.innerHTML = `
      <li class="attendee-empty">
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
          <span class="name">${a.name}</span>
        </div>
        <div class="attendee-row-actions">
          <div class="segmented" role="group" aria-label="${a.name} 참석 유형" data-person="${a.id}">
            <button type="button" class="seg-btn ${state.attendance[a.id] ? 'active' : ''}" data-value="required">필참</button>
            <button type="button" class="seg-btn ${!state.attendance[a.id] ? 'active' : ''}" data-value="optional">선택 참석</button>
          </div>
          <button type="button" class="remove-attendee-btn" data-person="${a.id}" aria-label="${a.name} 삭제">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </li>`;
    }).join('');
  }

  list.querySelectorAll('.segmented').forEach(seg => {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      const personId = seg.dataset.person;
      state.attendance[personId] = btn.dataset.value === 'required';
      seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  list.querySelectorAll('.remove-attendee-btn').forEach(btn => {
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
  findBtn.disabled = count === 0;
  document.getElementById('find-time-hint').style.display = count === 0 ? 'block' : 'none';

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

function renderPickerList() {
  const pickerList = document.getElementById('picker-list');
  const query = pickerQuery.trim();
  const matches = query
    ? ATTENDEES.filter(a => a.name.includes(query))
    : ATTENDEES;

  if (matches.length === 0) {
    pickerList.innerHTML = `
      <div class="picker-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span>‘${query}’와 일치하는 동료가 없어요</span>
      </div>`;
    return;
  }

  pickerList.innerHTML = matches.map(a => `
    <label class="check-item">
      <input type="checkbox" data-person="${a.id}" ${pickerCheckedIds.includes(a.id) ? 'checked' : ''}>
      <span class="avatar">${a.name[0]}</span>
      <span>${a.name}</span>
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

function renderAltSlots() {
  const wrap = document.getElementById('alt-slots');
  wrap.innerHTML = SLOTS.slice(1).map(slot => `
    <div class="alt-card-wrap">
      <div class="alt-card" data-toggle-slot="${slot.id}" role="button" tabindex="0" aria-expanded="false" aria-controls="alt-${slot.id}-evidence">
        <div class="alt-card-left">
          <span class="alt-card-time">${buildSlotLabel(slot)}</span>
          <span class="alt-card-meta">${slot.summary.title} · 참석률 ${slot.attendanceRate}%</span>
        </div>
        <div class="alt-card-right">
          <span class="alt-card-score">${slot.score}<span> 점</span></span>
          <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <div class="evidence-panel" id="alt-${slot.id}-evidence">
        <div class="evidence-panel-inner">
          <div class="card">
            <div class="card-title">회의 적합도 계산 기준</div>
            <p class="card-desc">${slot.summary.message}</p>
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
          <button class="btn btn-primary btn-block" data-action="book" data-slot="${slot.id}">이 시간으로 예약</button>
        </div>
      </div>
    </div>
  `).join('');

  SLOTS.slice(1).forEach(slot => {
    mountEvidence(`alt-${slot.id}`, slot);
    const header = wrap.querySelector(`.alt-card[data-toggle-slot="${slot.id}"]`);
    const panel = document.getElementById(`alt-${slot.id}-evidence`);
    header.addEventListener('click', () => toggleEvidencePanel(panel, header));
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
    });
  });
}

function renderHeroCard(slot) {
  document.getElementById('hero-time').textContent = buildSlotLabel(slot);
  document.getElementById('hero-score').innerHTML = `${slot.score}<span class="score-unit">점</span>`;
  const labelEl = document.getElementById('hero-score-label');
  labelEl.textContent = slot.scoreLabel;
  labelEl.className = `score-label score-label--${scoreLabelClass(slot.score)}`;
  document.getElementById('hero-summary-message').textContent = slot.summary.message;
  document.getElementById('hero-attendance').textContent = `${slot.attendanceRate}%`;
}

document.getElementById('find-time-btn').addEventListener('click', () => {
  if (state.selectedAttendeeIds.length === 0) return;
  document.getElementById('meeting-form').style.display = 'none';
  document.getElementById('loading-wrap').style.display = 'flex';
  setStepper('recommend', 'create');
  setTimeout(() => {
    document.getElementById('loading-wrap').style.display = 'none';
    document.getElementById('meeting-results').style.display = 'block';
    renderHeroCard(SLOTS[0]);
    mountEvidence('hero', SLOTS[0]);
    renderAltSlots();
  }, 900);
});

document.getElementById('edit-attendees-btn').addEventListener('click', () => {
  document.getElementById('meeting-results').style.display = 'none';
  document.getElementById('meeting-form').style.display = 'block';
});

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
  setMeetingDate(toISODate(new Date()));
  setSearchMode('period');
  document.getElementById('period-quick-thisweek').checked = true;
  setPeriodQuick('thisweek');
  document.getElementById('duration-select').value = '1시간';
  document.getElementById('meeting-results').style.display = 'none';
  document.getElementById('loading-wrap').style.display = 'none';
  document.getElementById('meeting-form').style.display = 'block';
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
// Stepper
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
// Screen 01 — profile save
// ============================================================================
document.getElementById('save-profile-btn').addEventListener('click', () => {
  showToast('저장했어요. 이후 회의 추천에 자동으로 반영돼요.');
});

// ============================================================================
// Screen 03 — booking detail (date/attendees lead, suitability is secondary)
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

  document.getElementById('detail-time').textContent = booking.label;
  document.getElementById('detail-attendees').innerHTML = buildAttendeeSummaryHtml(booking.attendeeIds);

  document.getElementById('detail-score').innerHTML = `${slot.score}<span class="score-unit">점</span>`;
  const labelEl = document.getElementById('detail-score-label');
  labelEl.textContent = slot.scoreLabel;
  labelEl.className = `score-label score-label--${scoreLabelClass(slot.score)}`;
  document.getElementById('detail-desc').textContent = slot.summary.message;

  document.getElementById('criteria-list').innerHTML = buildScoreBreakdownHtml(slot.detail);
  mountHeatmap(document.getElementById('heatmap'), slot);
}

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
  document.getElementById(`${prefix}-criteria`).innerHTML = buildScoreBreakdownHtml(slot.detail);
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
  if (e.key === 'Escape') { closePersonSheet(); closeConfirmDialog(); }
});

// ============================================================================
// Global action delegation — book buttons (hero card, alt card panels, Screen 03)
// ============================================================================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action="book"]');
  if (!el) return;
  const slot = SLOTS.find(s => s.id === Number(el.dataset.slot));
  confirmBooking(slot);
});

function confirmBooking(slot) {
  const attendeeIds = state.selectedAttendeeIds.length ? [...state.selectedAttendeeIds] : Object.keys(slot.people);
  const label = buildSlotLabel(slot); // snapshot — the date picker may change after this
  state.bookings.push({ id: Date.now(), slot, attendeeIds, label });
  showToast(`${label} 회의가 예약됐어요.`);
  resetCreateFlow();
  renderHome();
  showScreen('home');
}

document.getElementById('detail-back-btn').addEventListener('click', () => {
  showScreen('home');
});

// Reschedule: drop the current booking but carry its attendees into a fresh search.
document.getElementById('detail-reschedule-btn').addEventListener('click', () => {
  const booking = state.activeBooking;
  state.bookings = state.bookings.filter(b => b.id !== booking.id);
  resetCreateFlow();
  state.selectedAttendeeIds = [...booking.attendeeIds];
  booking.attendeeIds.forEach(id => {
    if (!(id in state.attendance)) {
      state.attendance[id] = true; // new attendees default to 필참
    }
  });
  renderAttendeeList();
  renderHome();
  showToast('참석자는 그대로 뒀어요. 새 시간을 찾아보세요.');
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

function renderHome() {
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
    upcomingWrap.innerHTML = state.bookings.slice().reverse().map(b => `
      <div class="meeting-item" data-booking="${b.id}">
        <div class="meeting-item-left">
          <span class="meeting-item-time">${b.label}</span>
          <div class="meeting-item-attendees">${avatarStackHtml(b.attendeeIds)}</div>
        </div>
        <div class="meeting-item-right">
          <span class="meeting-item-score">${b.slot.score}<span> 점</span></span>
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
  pastWrap.innerHTML = PAST_MEETINGS.map(m => `
    <div class="meeting-item past">
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
// Init
// ============================================================================
document.getElementById('meeting-date-input').min = toISODate(new Date());
document.getElementById('period-start-input').min = toISODate(new Date());
document.getElementById('period-end-input').min = toISODate(new Date());
setMeetingDate(toISODate(new Date()));
setSearchMode('period');
document.getElementById('period-quick-thisweek').checked = true;
setPeriodQuick('thisweek');
renderAttendeeList();
renderHome();
