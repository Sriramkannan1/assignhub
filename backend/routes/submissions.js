const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate, requireAdmin, requireStudent } = require('../middleware/auth');
const { upload, forSubmission } = require('../middleware/upload');

// GET /api/submissions - list submissions
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { assignment_id, student_id, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (req.user.role === 'admin') {
      // Admin: cross-join style — all students × all (or filtered) assignments
      const assignmentFilter = assignment_id && mongoose.Types.ObjectId.isValid(assignment_id)
        ? { _id: new mongoose.Types.ObjectId(assignment_id) }
        : {};
      const userFilter = {
        role: 'student',
        status: 'active',
        ...(student_id && mongoose.Types.ObjectId.isValid(student_id)
          ? { _id: new mongoose.Types.ObjectId(student_id) }
          : {}),
      };

      const [students, assignments] = await Promise.all([
        User.find(userFilter).select('_id full_name roll_number email avatar_seed avatar_url').lean(),
        Assignment.find(assignmentFilter).select('_id title subject deadline max_score').lean(),
      ]);

      const submissionsMap = {};
      const existingSubs = await Submission.find({
        student_id: { $in: students.map(s => s._id) },
        assignment_id: { $in: assignments.map(a => a._id) },
      }).populate('graded_by', 'full_name').lean();

      existingSubs.forEach(sub => {
        const key = `${sub.student_id}-${sub.assignment_id}`;
        submissionsMap[key] = sub;
      });

      const rows = [];
      for (const student of students) {
        for (const assignment of assignments) {
          const key = `${student._id}-${assignment._id}`;
          const sub = submissionsMap[key];

          const row = {
            id: sub ? sub._id.toString() : null,
            score: sub ? sub.score : null,
            max_score: sub ? sub.max_score : null,
            file_path: sub ? sub.file_path : null,
            feedback: sub ? sub.feedback : null,
            submitted_at: sub ? sub.submitted_at : null,
            graded_at: sub ? sub.graded_at : null,
            assignment_id: assignment._id.toString(),
            assignment_title: assignment.title,
            subject: assignment.subject,
            deadline: assignment.deadline,
            assignment_max_score: assignment.max_score,
            student_id: student._id.toString(),
            student_name: student.full_name,
            roll_number: student.roll_number,
            student_email: student.email,
            avatar_seed: student.avatar_seed,
            avatar_url: student.avatar_url,
            graded_by_name: sub?.graded_by?.full_name || null,
            status: sub ? sub.status : 'pending',
          };

          if (status) {
            if (status === 'pending' && sub) continue;
            if (status !== 'pending' && (!sub || sub.status !== status)) continue;
          }

          rows.push(row);
        }
      }

      const paginated = rows.slice(skip, skip + parseInt(limit));
      return res.json({ success: true, submissions: paginated, total: rows.length });
    }

    // Student: own submissions only
    const filter = { student_id: req.user.id };
    if (assignment_id) filter.assignment_id = assignment_id;
    if (status) filter.status = status;

    const [submissions, total] = await Promise.all([
      Submission.find(filter)
        .populate('assignment_id', 'title subject deadline max_score')
        .populate('student_id', 'full_name roll_number email avatar_seed avatar_url')
        .populate('graded_by', 'full_name')
        .sort({ submitted_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Submission.countDocuments(filter),
    ]);

    const shaped = submissions.map(sub => ({
      ...sub,
      id: sub._id.toString(),
      assignment_id: sub.assignment_id?._id ? sub.assignment_id._id.toString() : sub.assignment_id,
      assignment_title: sub.assignment_id?.title,
      subject: sub.assignment_id?.subject,
      deadline: sub.assignment_id?.deadline,
      assignment_max_score: sub.assignment_id?.max_score,
      student_name: sub.student_id?.full_name,
      roll_number: sub.student_id?.roll_number,
      student_email: sub.student_id?.email,
      avatar_seed: sub.student_id?.avatar_seed,
      avatar_url: sub.student_id?.avatar_url,
      graded_by_name: sub.graded_by?.full_name || null,
    }));

    res.json({ success: true, submissions: shaped, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
});

// GET /api/submissions/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const filter = { _id: req.params.id };
    if (req.user.role === 'student') filter.student_id = req.user.id;

    const sub = await Submission.findOne(filter)
      .populate('assignment_id', 'title subject deadline max_score')
      .populate('student_id', 'full_name roll_number email avatar_seed avatar_url')
      .populate('graded_by', 'full_name')
      .lean();

    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found' });

    res.json({
      success: true,
      submission: {
        ...sub,
        id: sub._id.toString(),
        assignment_id: sub.assignment_id?._id ? sub.assignment_id._id.toString() : sub.assignment_id,
        assignment_title: sub.assignment_id?.title,
        subject: sub.assignment_id?.subject,
        deadline: sub.assignment_id?.deadline,
        assignment_max_score: sub.assignment_id?.max_score,
        student_name: sub.student_id?.full_name,
        roll_number: sub.student_id?.roll_number,
        student_email: sub.student_id?.email,
        graded_by_name: sub.graded_by?.full_name || null,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/submissions - student submits assignment
router.post('/', authenticate, requireStudent, forSubmission,
  upload.single('file'), [
    body('assignment_id').notEmpty().withMessage('Assignment ID is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { assignment_id, notes } = req.body;

      if (!mongoose.Types.ObjectId.isValid(assignment_id)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const assignment = await Assignment.findById(assignment_id);
      if (!assignment) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const existing = await Submission.findOne({ assignment_id, student_id: req.user.id });
      if (existing) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(409).json({ success: false, message: 'You have already submitted this assignment' });
      }

      const now = new Date();
      const isLate = now > new Date(assignment.deadline);
      const status = isLate ? 'late' : 'submitted';

      const submission = await Submission.create({
        assignment_id,
        student_id: req.user.id,
        file_path: req.file ? req.file.path : null,
        file_name: req.file ? req.file.originalname : null,
        file_size: req.file ? req.file.size : null,
        notes,
        status,
        submitted_at: now,
      });

      // Notify student
      await Notification.create({
        user_id: req.user.id,
        title: 'Submission Confirmed',
        message: `Your submission for "${assignment.title}" has been received${isLate ? ' (late)' : ''}.`,
        type: isLate ? 'late' : 'info',
      });

      // Notify admin
      const admin = await User.findOne({ role: 'admin' });
      if (admin) {
        await Notification.create({
          user_id: admin._id,
          title: `New Submission: ${assignment.title}`,
          message: `A student submitted "${assignment.title}"${isLate ? ' (LATE)' : ''}.`,
          type: isLate ? 'late' : 'info',
        });
      }

      res.status(201).json({ success: true, submission: { ...submission.toJSON(), id: submission._id.toString() } });
    } catch (err) { next(err); }
  }
);

// PUT /api/submissions/:id/grade - admin grades submission
router.put('/:id/grade', authenticate, requireAdmin, [
  body('score').isInt({ min: 0 }).withMessage('Score must be a non-negative integer'),
  body('feedback').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const sub = await Submission.findById(req.params.id)
      .populate('assignment_id', 'title max_score')
      .populate('student_id', 'full_name');
    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found' });

    const { score, feedback } = req.body;
    if (score > sub.assignment_id.max_score) {
      return res.status(400).json({ success: false, message: `Score cannot exceed max score of ${sub.assignment_id.max_score}` });
    }

    const updated = await Submission.findByIdAndUpdate(req.params.id, {
      score,
      feedback,
      status: 'graded',
      max_score: sub.assignment_id.max_score,
      graded_by: req.user.id,
      graded_at: new Date(),
    }, { new: true });

    // Notify student
    await Notification.create({
      user_id: sub.student_id._id,
      title: 'Assignment Graded',
      message: `Your submission for "${sub.assignment_id.title}" has been graded. You scored ${score}/${sub.assignment_id.max_score}.`,
      type: 'grade',
    });

    res.json({ success: true, submission: { ...updated.toJSON(), id: updated._id.toString() } });
  } catch (err) { next(err); }
});

// GET /api/submissions/:id/download
router.get('/:id/download', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filter = { _id: req.params.id };
    if (req.user.role === 'student') filter.student_id = req.user.id;

    const sub = await Submission.findOne(filter).select('file_path file_name');
    if (!sub || !sub.file_path) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    if (!fs.existsSync(sub.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.download(sub.file_path, sub.file_name);
  } catch (err) { next(err); }
});

// GET /api/submissions/bulk/download - admin
router.get('/bulk/download', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { assignment_id } = req.query;
    const subs = await Submission.find({ assignment_id, file_path: { $ne: null } })
      .populate('student_id', 'full_name roll_number')
      .lean();

    const files = subs.map(s => ({
      file_name: s.file_name,
      file_path: s.file_path,
      full_name: s.student_id?.full_name,
      roll_number: s.student_id?.roll_number,
    }));

    res.json({ success: true, files, message: 'Use individual download endpoints per submission.' });
  } catch (err) { next(err); }
});

module.exports = router;
