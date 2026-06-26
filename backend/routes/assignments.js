const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { upload, forAssignment } = require('../middleware/upload');

// GET /api/assignments - list assignments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, search, sort, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};

    if (req.user.role === 'student') {
      // Students see non-closed OR ones they submitted to
      const mySubmissions = await Submission.find({ student_id: req.user.id }).distinct('assignment_id');
      filter.$or = [
        { status: { $ne: 'closed' } },
        { _id: { $in: mySubmissions } },
      ];
    }

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        ...(filter.$or || []),
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
      ];
    }

    let sortObj = { deadline: 1 };
    if (sort === 'newest') sortObj = { created_at: -1 };
    else if (sort === 'oldest') sortObj = { created_at: 1 };

    const [assignments, total] = await Promise.all([
      Assignment.find(filter)
        .populate('created_by', 'full_name')
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Assignment.countDocuments(filter),
    ]);

    // Enrich with submission counts and student's own submission
    const assignmentIds = assignments.map(a => a._id);
    const [submissionCounts, lateCountsArr, totalActiveStudents] = await Promise.all([
      Submission.aggregate([
        { $match: { assignment_id: { $in: assignmentIds } } },
        { $group: { _id: '$assignment_id', count: { $sum: 1 }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } },
      ]),
      Promise.resolve([]),
      User.countDocuments({ role: 'student', status: 'active' }),
    ]);

    const countMap = {};
    submissionCounts.forEach(s => { countMap[s._id.toString()] = { count: s.count, late: s.late }; });

    let mySubMap = {};
    if (req.user.role === 'student') {
      const mySubs = await Submission.find({ student_id: req.user.id, assignment_id: { $in: assignmentIds } }).lean();
      mySubs.forEach(s => { mySubMap[s.assignment_id.toString()] = s; });
    }

    const enriched = assignments.map(a => {
      const sid = a._id.toString();
      return {
        ...a,
        id: sid,
        created_by_name: a.created_by ? a.created_by.full_name : null,
        submission_count: countMap[sid]?.count || 0,
        late_count: countMap[sid]?.late || 0,
        total_students: totalActiveStudents,
        ...(req.user.role === 'student' ? { my_submission: mySubMap[sid] || null } : {}),
      };
    });

    res.json({
      success: true,
      assignments: enriched,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) { next(err); }
});

// GET /api/assignments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = await Assignment.findById(req.params.id)
      .populate('created_by', 'full_name')
      .lean();

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const [submissionCount, totalStudents] = await Promise.all([
      Submission.countDocuments({ assignment_id: assignment._id }),
      User.countDocuments({ role: 'student', status: 'active' }),
    ]);

    let mySubmission = null;
    if (req.user.role === 'student') {
      mySubmission = await Submission.findOne({
        assignment_id: assignment._id,
        student_id: req.user.id,
      }).lean();
    }

    res.json({
      success: true,
      assignment: {
        ...assignment,
        id: assignment._id.toString(),
        created_by_name: assignment.created_by ? assignment.created_by.full_name : null,
        submission_count: submissionCount,
        total_students: totalStudents,
        ...(req.user.role === 'student' ? { my_submission: mySubmission } : {}),
      },
    });
  } catch (err) { next(err); }
});

// POST /api/assignments - admin creates assignment
router.post('/', authenticate, requireAdmin, forAssignment,
  upload.single('file'), [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('deadline').isISO8601().withMessage('Valid deadline required'),
    body('max_score').optional().isInt({ min: 1 }).withMessage('Max score must be positive'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { title, description, subject, department, deadline, max_score = 100 } = req.body;
      const dl = new Date(deadline);
      const finalStatus = dl < new Date() ? 'closed' : 'active';

      const assignment = await Assignment.create({
        title, description, subject, department, deadline: dl, max_score,
        file_path: req.file ? req.file.path : null,
        file_name: req.file ? req.file.originalname : null,
        status: finalStatus,
        created_by: req.user.id,
      });

      // Notify all active students
      const students = await User.find({ role: 'student', status: 'active' }).select('_id');
      if (students.length) {
        const notifications = students.map(s => ({
          user_id: s._id,
          title: `New Assignment: ${title}`,
          message: `A new assignment "${title}" is now available. Deadline: ${dl.toLocaleDateString()}.`,
          type: 'info',
        }));
        await Notification.insertMany(notifications);
      }

      res.status(201).json({ success: true, assignment: { ...assignment.toJSON(), id: assignment._id.toString() } });
    } catch (err) { next(err); }
  }
);

// PUT /api/assignments/:id - admin updates assignment
router.put('/:id', authenticate, requireAdmin, forAssignment,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const { title, description, subject, department, deadline, max_score, status } = req.body;
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (subject !== undefined) updates.subject = subject;
      if (department !== undefined) updates.department = department;
      if (deadline !== undefined) updates.deadline = new Date(deadline);
      if (max_score !== undefined) updates.max_score = max_score;
      if (status !== undefined) updates.status = status;
      if (req.file) {
        updates.file_path = req.file.path;
        updates.file_name = req.file.originalname;
      }

      const assignment = await Assignment.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

      res.json({ success: true, assignment: assignment.toJSON() });
    } catch (err) { next(err); }
  }
);

// DELETE /api/assignments/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    if (assignment.file_path && fs.existsSync(assignment.file_path)) {
      fs.unlinkSync(assignment.file_path);
    }

    res.json({ success: true, message: 'Assignment deleted' });
  } catch (err) { next(err); }
});

// GET /api/assignments/:id/download
router.get('/:id/download', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const assignment = await Assignment.findById(req.params.id).select('file_path file_name');
    if (!assignment || !assignment.file_path) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    if (!fs.existsSync(assignment.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.download(assignment.file_path, assignment.file_name);
  } catch (err) { next(err); }
});

module.exports = router;
