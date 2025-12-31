function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createInitialState({ packs }) {
  const firstPack = Object.values(packs)[0];
  const initialPackId = firstPack?.id || null;

  return {
    session: {
      id: "default",
      title: "Новогодняя викторина",
      createdAt: Date.now()
    },
    ui: {
      phase: "idle",
      reveal: "none"
    },
    selection: {
      packId: initialPackId,
      questionIndex: 0
    },
    runtime: {
      startedAt: null,
      lastActionAt: Date.now()
    }
  };
}

export function getCurrentQuestion(state, packs) {
  const packId = state.selection.packId;
  if (!packId) return null;
  const pack = packs[packId];
  if (!pack) return null;
  const q = pack.questions[state.selection.questionIndex] || null;
  if (!q) return null;
  return { pack, question: q };
}

function clampIndex(idx, len) {
  if (len <= 0) return 0;
  const n = Number(idx);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(len - 1, Math.trunc(n)));
}

export function reduceAdminAction(prevState, action, { packs }) {
  const state = clone(prevState);
  state.runtime.lastActionAt = Date.now();

  if (!action || typeof action !== "object") return state;

  if (action.type === "setPack") {
    const packId = action.packId;
    if (!packs[packId]) throw new Error("unknown_pack");
    state.selection.packId = packId;
    state.selection.questionIndex = 0;
    state.ui.phase = "idle";
    state.ui.reveal = "none";
    return state;
  }

  const currentPack = packs[state.selection.packId];
  const maxLen = currentPack?.questions?.length || 0;

  if (action.type === "setQuestionIndex") {
    state.selection.questionIndex = clampIndex(action.index, maxLen);
    state.ui.phase = "idle";
    state.ui.reveal = "none";
    return state;
  }

  if (action.type === "prev") {
    state.selection.questionIndex = clampIndex(state.selection.questionIndex - 1, maxLen);
    state.ui.phase = "idle";
    state.ui.reveal = "none";
    return state;
  }

  if (action.type === "next") {
    state.selection.questionIndex = clampIndex(state.selection.questionIndex + 1, maxLen);
    state.ui.phase = "idle";
    state.ui.reveal = "none";
    return state;
  }

  if (action.type === "start") {
    state.ui.phase = "question";
    state.ui.reveal = "none";
    state.runtime.startedAt = Date.now();
    return state;
  }

  if (action.type === "reveal") {
    const step = action.step;
    if (!["hint", "answer"].includes(step)) throw new Error("invalid_reveal_step");
    state.ui.reveal = step;
    state.ui.phase = "question";
    return state;
  }

  if (action.type === "reset") {
    state.ui.phase = "idle";
    state.ui.reveal = "none";
    state.runtime.startedAt = null;
    return state;
  }

  return state;
}
