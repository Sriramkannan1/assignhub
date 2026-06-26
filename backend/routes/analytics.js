const router = require('express').Router();
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/analytics/overview
router.get('/overview', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [submissionStats, topStudents, deptEngagement, recentTrend] = await Promise.all([
      // Overall submission stats
      Submission.aggregate([
        {
          $lookup: {
            from: 'assignments',
            localField: 'assignment_id',
            foreignField: '_id',
            as: 'assignment',
          },
        },
        { $unwind: '$assignment' },
        {
          $group: {
            _id: null,
            total_submitted: { $sum: 1 },
            on_time: {
              $sum: {
                $cond: [{ $lte: ['$submitted_at', '$assignment.deadline'] }, 1, 0],
              },
            },
            late: {
              $sum: {
                $cond: [{ $gt: ['$submitted_at', '$assignment.deadline'] }, 1, 0],
              },
            },
            avg_score: { $avg: '$score' },
          },
        },
      ]),

      // Top students by avg score
      Submission.aggregate([
        { $match: { score: { $ne: null } } },
        {
          $group: {
            _id: '$student_id',
            avg_score: { $avg: '$score' },
            submission_count: { $sum: 1 },
          },
        },
        { $match: { submission_count: { $gt: 0 } } },
        { $sort: { avg_score: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: '$student' },
        {
          $project: {
            full_name: '$student.full_name',
            roll_number: '$student.roll_number',
            avatar_seed: '$student.avatar_seed',
            department: '$student.department',
            avg_score: { $round: ['$avg_score', 1] },
            submission_count: 1,
          },
        },
      ]),

      // Department engagement
      User.aggregate([
        { $match: { role: 'student', status: 'active', department: { $ne: null } } },
        {
          $lookup: {
            from: 'submissions',
            localField: '_id',
            foreignField: 'student_id',
            as: 'submissions',
          },
        },
        {
          $group: {
            _id: '$department',
            active_students: { $sum: 1 },
            total_submissions: { $sum: { $size: '$submissions' } },
            avg_score: {
              $avg: {
                $avg: {
                  $filter: {
                    input: '$submissions.score',
                    cond: { $ne: ['$$this', null] },
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            department: '$_id',
            active_students: 1,
            total_submissions: 1,
            avg_score: { $ifNull: [{ $round: ['$avg_score', 1] }, 0] },
          },
        },
        { $sort: { active_students: -1 } },
      ]),

      // Last 7 days submission trend
      Submission.aggregate([
        { $match: { submitted_at: { $gte: sevenDaysAgo } } },
        {
          $lookup: {
            from: 'assignments',
            localField: 'assignment_id',
            foreignField: '_id',
            as: 'assignment',
          },
        },
        { $unwind: '$assignment' },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$submitted_at' },
            },
            submitted: {
              $sum: { $cond: [{ $lte: ['$submitted_at', '$assignment.deadline'] }, 1, 0] },
            },
            late: {
              $sum: { $cond: [{ $gt: ['$submitted_at', '$assignment.deadline'] }, 1, 0] },
            },
          },
        },
        { $project: { day: '$_id', submitted: 1, late: 1, _id: 0 } },
        { $sort: { day: 1 } },
      ]),
    ]);

    const [activeStudents, totalAssignments] = await Promise.all([
      User.countDocuments({ role: 'student', status: 'active' }),
      Assignment.countDocuments(),
    ]);

    const s = submissionStats[0] || { total_submitted: 0, on_time: 0, late: 0, avg_score: 0 };
    const expected = Math.max(1, activeStudents * totalAssignments);
    const submittedCount = s.total_submitted || 0;
    const completionRate = Math.round((submittedCount / expected) * 100);

    res.json({
      success: true,
      analytics: {
        completion_rate: completionRate,
        on_time_rate: submittedCount ? Math.round((s.on_time / submittedCount) * 100) : 0,
        late_rate: submittedCount ? Math.round((s.late / submittedCount) * 100) : 0,
        avg_score: parseFloat((s.avg_score || 0).toFixed(1)),
        top_students: topStudents,
        department_engagement: deptEngagement,
        submission_trend: recentTrend,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/assignment/:id
router.get('/assignment/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignmentObjId = new mongoose.Types.ObjectId(req.params.id);

    const [assignment, breakdown, scoreDistribution] = await Promise.all([
      Assignment.findById(assignmentObjId).lean(),

      Submission.aggregate([
        { $match: { assignment_id: assignmentObjId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } },
            avg_score: { $avg: '$score' },
            max_score_achieved: { $max: '$score' },
            min_score: { $min: '$score' },
          },
        },
      ]),

      Submission.aggregate([
        { $match: { assignment_id: assignmentObjId, score: { $ne: null } } },
        {
          $project: {
            range: {
              $switch: {
                branches: [
                  { case: { $gte: ['$score', 90] }, then: '90-100' },
                  { case: { $gte: ['$score', 80] }, then: '80-89' },
                  { case: { $gte: ['$score', 70] }, then: '70-79' },
                  { case: { $gte: ['$score', 60] }, then: '60-69' },
                ],
                default: 'Below 60',
              },
            },
          },
        },
        { $group: { _id: '$range', count: { $sum: 1 } } },
        { $project: { range: '$_id', count: 1, _id: 0 } },
        { $sort: { range: -1 } },
      ]),
    ]);

    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const stats = breakdown[0] || {
      total: 0, submitted: 0, late: 0, graded: 0,
      avg_score: null, max_score_achieved: null, min_score: null,
    };

    res.json({
      success: true,
      assignment: { ...assignment, id: assignment._id.toString() },
      stats: {
        ...stats,
        avg_score: stats.avg_score !== null ? parseFloat(stats.avg_score.toFixed(1)) : null,
      },
      score_distribution: scoreDistribution,
    });
  } catch (err) { next(err); }
});

module.exports = router;
