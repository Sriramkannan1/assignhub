const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Notification = require('../models/Notification');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/users - admin: list all users
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { role, status, department, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (department) filter.department = { $regex: department, $options: 'i' };
    if (search) {
      filter.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { roll_number: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password_hash')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users: users.map(u => ({ ...u, id: u._id.toString() })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) { next(err); }
});

// POST /api/users - admin creates active student
router.post('/', authenticate, requireAdmin, [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('roll_number').trim().notEmpty().withMessage('Roll number is required'),
  body('department').trim().notEmpty().withMessage('Department is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { full_name, email, password, roll_number, department } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { roll_number }] });
    if (existing) return res.status(409).json({ success: false, message: 'Email or roll number already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      full_name, email, password_hash, role: 'student',
      roll_number, department, avatar_seed: full_name.split(' ')[0],
      status: 'active', email_verified: true,
    });

    await Notification.create({
      user_id: user._id,
      title: 'Account Created',
      message: 'Your student account has been created by an administrator. Welcome to AssignHub!',
      type: 'info',
    });

    res.status(201).json({
      success: true,
      message: 'Student added successfully',
      user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) { next(err); }
});

// GET /api/users/stats - admin dashboard stats
router.get('/stats', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStudents, activeStudents, pendingStudents, approvedToday,
      totalAssignments, activeAssignments,
      subStats,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', status: 'active' }),
      User.countDocuments({ role: 'student', status: 'pending' }),
      User.countDocuments({ role: 'student', status: 'active', updated_at: { $gte: today } }),
      Assignment.countDocuments(),
      Assignment.countDocuments({ status: 'active' }),
      Submission.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            submitted: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'graded']] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } },
            avg_score: { $avg: '$score' },
          },
        },
      ]),
    ]);

    const s = subStats[0] || { total: 0, submitted: 0, late: 0, graded: 0, avg_score: 0 };
    const totalExpected = activeStudents * totalAssignments;
    const completionRate = totalExpected > 0 ? Math.round((s.submitted / totalExpected) * 100) : 0;

    res.json({
      success: true,
      stats: {
        total_students: totalStudents,
        active_students: activeStudents,
        pending_students: pendingStudents,
        approved_today: approvedToday,
        total_assignments: totalAssignments,
        active_assignments: activeAssignments,
        total_submissions: s.total,
        late_submissions: s.late,
        completion_rate: completionRate,
        avg_score: parseFloat((s.avg_score || 0).toFixed(1)),
        pending_approvals: pendingStudents,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/users/student-stats
router.get('/student-stats', authenticate, async (req, res, next) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.user.id);

    const [subStats, pendingCount, nextDeadline] = await Promise.all([
      Submission.aggregate([
        { $match: { student_id: studentId } },
        {
          $group: {
            _id: null,
            completed: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'graded', 'late']] }, 1, 0] } },
            late_count: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
            graded_count: { $sum: { $cond: [{ $ne: ['$score', null] }, 1, 0] } },
            avg_score: { $avg: '$score' },
          },
        },
      ]),
      Assignment.countDocuments({
        status: { $in: ['active', 'upcoming'] },
        _id: {
          $nin: await Submission.find({ student_id: studentId }).distinct('assignment_id'),
        },
      }),
      Assignment.findOne({
        status: 'active',
        _id: {
          $nin: await Submission.find({ student_id: studentId }).distinct('assignment_id'),
        },
      }).sort({ deadline: 1 }).select('title deadline'),
    ]);

    const stats = subStats[0] || { completed: 0, late_count: 0, graded_count: 0, avg_score: 0 };

    res.json({
      success: true,
      stats: {
        pending: pendingCount,
        completed: stats.completed,
        avg_score: parseFloat((stats.avg_score || 0).toFixed(1)),
        graded_count: stats.graded_count,
        late_count: stats.late_count,
        next_deadline: nextDeadline ? { title: nextDeadline.title, deadline: nextDeadline.deadline } : null,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/users/pending-registrations
router.get('/pending-registrations', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', department = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { role: 'student', status: 'pending' };
    if (search) {
      filter.$or = [
        { full_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { roll_number: { $regex: search, $options: 'i' } },
      ];
    }
    if (department) filter.department = department;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('full_name email roll_number department avatar_seed avatar_url created_at')
        .sort({ created_at: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users: users.map(u => ({ ...u, id: u._id.toString() })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) { next(err); }
});

// PUT /api/users/me/avatar
router.put('/me/avatar', authenticate, async (req, res, next) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ success: false, message: 'Avatar image required' });

    const user = await User.findByIdAndUpdate(req.user.id, { avatar_url }, { new: true })
      .select('id full_name email role avatar_seed avatar_url');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Avatar updated', user });
  } catch (err) { next(err); }
});

// PUT /api/users/me
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { full_name, email, department, bio, job_title } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (email !== undefined) updates.email = email;
    if (department !== undefined) updates.department = department;
    if (bio !== undefined) updates.bio = bio;
    if (req.user.role === 'admin' && job_title !== undefined) updates.job_title = job_title;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true })
      .select('id full_name email role department bio avatar_seed avatar_url job_title');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile updated', user });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'student' && req.params.id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = await User.findById(req.params.id)
      .select('id full_name email role roll_number department bio avatar_seed avatar_url status last_active created_at')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user: { ...user, id: user._id.toString() } });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', authenticate, requireAdmin, [
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { status: req.body.status },
      { new: true }
    ).select('id full_name email status');
    if (!user) return res.status(404).json({ success: false, message: 'Student not found' });

    const action = req.body.status === 'active' ? 'approved' : req.body.status;
    await Notification.create({
      user_id: user._id,
      title: `Account ${action}`,
      message: `Your AssignHub account has been ${action} by the administrator.`,
      type: 'info',
    });

    res.json({ success: true, user: { ...user.toJSON(), id: user._id.toString() } });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const user = await User.findOneAndDelete({ _id: req.params.id, role: 'student' });
    if (!user) return res.status(404).json({ success: false, message: 'Student not found' });

    res.json({ success: true, message: 'Student removed' });
  } catch (err) { next(err); }
});

module.exports = router;
