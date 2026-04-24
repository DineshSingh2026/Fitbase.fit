export const LM = {
  LS: 11,
  RS: 12,
  LE: 13,
  RE: 14,
  LW: 15,
  RW: 16,
  LH: 23,
  RH: 24,
  LK: 25,
  RK: 26,
  LA: 27,
  RA: 28
} as const;

export type ExerciseId =
  | "squat"
  | "pushup"
  | "plank"
  | "jumpingjack"
  | "biccurl"
  | "shoulderpress"
  | "bentoverrow"
  | "lunge"
  | "calfraise"
  | "lateralraise"
  | "tricepsdip"
  | "frontraise";

export const EXERCISES: { id: ExerciseId; label: string }[] = [
  { id: "squat", label: "Squat" },
  { id: "pushup", label: "Push-up" },
  { id: "plank", label: "Plank" },
  { id: "jumpingjack", label: "Jumping Jack" },
  { id: "biccurl", label: "Bicep Curl" },
  { id: "shoulderpress", label: "Shoulder Press" },
  { id: "bentoverrow", label: "Bent-over Row" },
  { id: "lunge", label: "Lunge" },
  { id: "calfraise", label: "Calf Raise" },
  { id: "lateralraise", label: "Lateral Raise" },
  { id: "tricepsdip", label: "Triceps Dip" },
  { id: "frontraise", label: "Front Raise" }
];

export const TIPS: Record<ExerciseId, string[]> = {
  squat: [
    "Chest up, weight in mid-foot.",
    "Break at hips and knees together.",
    "Depth near 90° without rounding.",
    "Drive up through heels."
  ],
  pushup: [
    "Hands under shoulders.",
    "Brace core — straight line head to heels.",
    "Full range: chest near floor.",
    "Lock out without shrugging."
  ],
  plank: [
    "Elbows under shoulders.",
    "Squeeze glutes and quads.",
    "Neutral neck — gaze slightly ahead.",
    "Breathe steady, no sagging hips."
  ],
  jumpingjack: ["Soft landings.", "Full arm overhead.", "Feet wide on “open”.", "Return controlled to closed."],
  biccurl: ["Elbows pinned at sides.", "Control the lowering phase.", "No torso swing.", "Full extension at bottom."],
  shoulderpress: ["Brace core, ribs down.", "Press straight up, biceps to ears.", "Avoid excessive back arch.", "Lower under control."],
  bentoverrow: ["Flat back hinge from hips.", "Pull elbows toward hips.", "Neck neutral.", "Squeeze shoulder blades."],
  lunge: [
    "Front knee tracks over ankle.",
    "Torso tall — slight forward lean from hips.",
    "Back knee travels down.",
    "Push through front heel to stand."
  ],
  calfraise: ["Knees almost straight (not squats).", "Rise onto balls of feet.", "Pause at top.", "Lower with control through full ROM."],
  lateralraise: ["Slight bend in elbows.", "Lead with elbows, pinkies slightly high.", "Stop near shoulder height.", "Lower slowly."],
  tricepsdip: ["Shoulders depressed — not shrugged.", "Elbows point back.", "Depth without shoulder pinch.", "Press up fully."],
  frontraise: ["Soft elbows.", "Lift to shoulder height.", "Avoid leaning back.", "Lower with control."]
};

export const WELCOME_TEXT =
  "Welcome to Fitbase AI Trainer. Pick an exercise, tap Start, and I'll coach your form.";

export const CUES = {
  intro: ["Let’s go — stay tall and move with control.", "Focus on smooth reps — quality beats speed."],
  milestones: {
    5: "Five reps — solid start.",
    10: "Ten reps — keep that rhythm.",
    15: "Fifteen — stay sharp.",
    20: "Twenty — great work.",
    25: "Twenty-five — finish strong.",
    30: "Thirty — outstanding."
  } as Record<number, string>,
  repPraiseGood: ["Nice rep.", "Solid.", "Clean."],
  repPraiseOk: ["Got it.", "Keep dialing it in.", "Stay with it."],
  phase: {
    squat: ["Sit back — knees track.", "Drive up tall."],
    pushup: ["Chest down controlled.", "Press the floor away."],
    plank: ["Hold the line.", "Breathe steady."]
  },
  correction: ["Reset your setup — stack joints.", "Slow down — control the eccentric.", "Check range — full path wins."],
  encouragement: ["You’re doing great — stay consistent.", "Breathe and finish this set strong.", "One quality rep at a time."],
  noPerson: ["Step into the frame when you’re ready.", "I need to see your body to count reps."]
};
