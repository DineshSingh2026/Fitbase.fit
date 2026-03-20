const db = require('../config/db');

function averageStrengthTriplet(l) {
  if (!l) return null;
  const vals = [l.strength_bench, l.strength_squat, l.strength_deadlift]
    .map((v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? parseFloat(v) : null))
    .filter((v) => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Logic-based AI insights.
 */
async function getInsights(userId) {
  const insights = [];
  const logs = await db.queryAll(
    'SELECT * FROM progress_logs WHERE user_id = ? ORDER BY created_at ASC',
    [userId]
  );
  if (!logs || logs.length === 0) return insights;

  const total = logs.length;
  const withWorkout = logs.filter(l => l.workout_completed);
  const consistency = total > 0 ? (withWorkout.length / total) * 100 : 0;
  if (consistency < 60) {
    insights.push('Consistency Needs Improvement');
  }

  const weights = logs.filter(l => l.weight != null).map(l => parseFloat(l.weight));
  if (weights.length >= 14) {
    const last14 = weights.slice(-14);
    const avg = last14.reduce((a, b) => a + b, 0) / last14.length;
    const allSame = last14.every(w => Math.abs(w - avg) < 0.5);
    if (allSame) {
      insights.push('Weight Plateau Detected');
    }
  }

  const withStrength = logs.filter(l => l.strength_bench != null || l.strength_squat != null || l.strength_deadlift != null);
  if (withStrength.length >= 2) {
    const first = withStrength[0];
    const last = withStrength[withStrength.length - 1];
    const firstAvg = averageStrengthTriplet(first);
    const lastAvg = averageStrengthTriplet(last);
    if (firstAvg != null && lastAvg != null && firstAvg > 0 && lastAvg > 0) {
      const growth = ((lastAvg - firstAvg) / firstAvg) * 100;
      if (growth > 10) {
        insights.push('Strength Milestone Achieved');
      }
    }
  }

  return insights;
}

module.exports = { getInsights };
