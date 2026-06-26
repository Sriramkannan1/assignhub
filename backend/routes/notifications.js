const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { is_read, type, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { user_id: req.user.id };
    if (is_read !== undefined) filter.is_read = is_read === 'true';
    if (type) filter.type = type;

    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user_id: req.user.id, is_read: false }),
    ]);

    res.json({
      success: true,
      notifications: notifications.map(n => ({ ...n, id: n._id.toString() })),
      total,
      unread,
      page: parseInt(page),
    });
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({ user_id: req.user.id, is_read: false });
    res.json({ success: true, count });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', authenticate, async (req, res, next) => {
  try {
    await Notification.updateMany({ user_id: req.user.id }, { is_read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { is_read: true }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    await Notification.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/notifications/broadcast - admin
router.post('/broadcast', authenticate, requireAdmin, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'grade', 'deadline', 'system']),
  body('target').optional().isIn(['all', 'active', 'student']),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { title, message, type = 'info', target = 'active' } = req.body;
    const statusFilter = target === 'all' ? {} : { status: 'active' };

    const students = await User.find({ role: 'student', ...statusFilter }).select('_id');
    if (!students.length) {
      return res.json({ success: true, message: 'No students to notify', count: 0 });
    }

    const notifications = students.map(s => ({ user_id: s._id, title, message, type }));
    await Notification.insertMany(notifications);

    res.json({ success: true, message: `Notification sent to ${students.length} students`, count: students.length });
  } catch (err) { next(err); }
});

module.exports = router;
