import mongoose from 'mongoose';

// The exam countdown plan of one notebook: one entry per day from the day it was (re)made to the exam eve.
// Dates are the student's local calendar days as "YYYY-MM-DD" strings (the browser sends "today"), so
// there are no timezone surprises around midnight.
const planItemSchema = new mongoose.Schema({
  kind: { type: String, enum: ['topic', 'revision', 'repeats'], required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null }, // kind 'topic'
  unit: { type: String, default: null }, // 'topic' and 'revision' (one revision sheet per unit)
  label: { type: String, required: true }, // "Minimax algorithm", "Last-night sheet: Unit 2"
  done: { type: Boolean, default: false },
});

const planDaySchema = new mongoose.Schema({ date: { type: String, required: true }, items: [planItemSchema] }, { _id: false });

const studyPlanSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, unique: true },
    examDate: { type: String, required: true }, // "YYYY-MM-DD"
    startDate: { type: String, required: true }, // the day the plan was (re)made
    days: { type: [planDaySchema], default: [] },
    // Topics ticked in the plan. Kept apart from the days: re-planning replaces the days, not what was studied.
    studiedTopics: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    leftOut: { type: Number, default: 0 }, // low-priority topics that didn't fit in the days left
    replanned: { type: Number, default: 0 }, // how many times missed days pushed the plan forward
  },
  { timestamps: true },
);

export const StudyPlan = mongoose.model('StudyPlan', studyPlanSchema);
