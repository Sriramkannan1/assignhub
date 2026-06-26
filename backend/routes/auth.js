const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const PasswordResetToken = require('../models/PasswordResetToken');
const { authenticate } = require('../middleware/auth');

const signToken = (user) => jwt.sign(
  { id: user._id || user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// POST /api/auth/register
router.post('/register', [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('roll_number').trim().notEmpty().withMessage('Roll number is required'),
  body('department').trim().notEmpty().withMessage('Department is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { full_name, email, password, roll_number, department } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { roll_number }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email or roll number already registered' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      full_name,
      email,
      password_hash,
      role: 'student',
      roll_number,
      department,
      avatar_seed: full_name.split(' ')[0],
      status: 'pending',
      email_verified: false,
    });

    // Notify admin
    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      await Notification.create({
        user_id: admin._id,
        title: `New Registration: ${full_name}`,
        message: `${full_name} (${roll_number}) has applied for the ${department} department.`,
        type: 'registration',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Awaiting admin approval.',
      user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Email or roll number is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { roll_number: identifier }],
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status === 'pending' && user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Your account is awaiting admin approval.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    }

    await User.findByIdAndUpdate(user._id, { last_active: new Date() });

    const token = signToken(user);
    const { password_hash, ...safeUser } = user.toJSON();

    res.json({
      success: true,
      token,
      user: safeUser,
      redirect: user.role === 'admin' ? '/admin-dashboard.html' : '/student-dashboard.html',
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id)
    .select('id full_name email role roll_number department bio avatar_seed avatar_url status last_active created_at')
    .lean();
  res.json({ success: true, user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('identifier').trim().notEmpty().withMessage('Email or roll number is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { identifier } = req.body;
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { roll_number: identifier }],
    });

    if (!user) {
      return res.json({ success: true, message: 'If that account exists, a reset code has been sent.' });
    }

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate old tokens for this user
    await PasswordResetToken.updateMany({ user_id: user._id, used: false }, { used: true });
    await PasswordResetToken.create({ user_id: user._id, token, expires_at: expiresAt });

    const response = { success: true, message: 'Reset code sent to your registered email.' };
    if (process.env.NODE_ENV === 'development') {
      response.dev_token = token;
    }

    res.json(response);
  } catch (err) { next(err); }
});

// POST /api/auth/verify-reset-token
router.post('/verify-reset-token', [
  body('identifier').trim().notEmpty(),
  body('token').trim().isLength({ min: 6, max: 6 }).withMessage('Invalid token'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { identifier, token } = req.body;
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { roll_number: identifier }],
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid reset request' });
    }

    const resetToken = await PasswordResetToken.findOne({
      user_id: user._id,
      token,
      expires_at: { $gt: new Date() },
      used: false,
    });

    if (!resetToken) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    res.json({ success: true, message: 'Token verified' });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('identifier').trim().notEmpty(),
  body('token').trim().isLength({ min: 6, max: 6 }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { identifier, token, password } = req.body;
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { roll_number: identifier }],
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid reset request' });
    }

    const resetToken = await PasswordResetToken.findOne({
      user_id: user._id,
      token,
      expires_at: { $gt: new Date() },
      used: false,
    });

    if (!resetToken) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    const hash = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(user._id, { password_hash: hash });
    await PasswordResetToken.findByIdAndUpdate(resetToken._id, { used: true });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, [
  body('full_name').optional().trim().notEmpty(),
  body('bio').optional().trim(),
  body('department').optional().trim(),
], async (req, res, next) => {
  try {
    const { full_name, bio, department } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (bio !== undefined) updates.bio = bio;
    if (department !== undefined) updates.department = department;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true })
      .select('id full_name email role bio department avatar_seed');
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { current_password, new_password } = req.body;
    const user = await User.findById(req.user.id).select('password_hash');
    const valid = await bcrypt.compare(current_password, user.password_hash);

    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await User.findByIdAndUpdate(req.user.id, { password_hash: hash });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
