/**
 * seed.js — Run once after first deploy to create the admin user.
 * Usage: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/db');
const User = require('./models/User');

(async () => {
  await connectDB();

  const email = process.env.ADMIN_EMAIL || 'admin@assignhub.edu';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`✅ Admin already exists: ${email}`);
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(password, 10);
  await User.create({
    full_name: 'Admin',
    email,
    password_hash,
    role: 'admin',
    status: 'active',
    email_verified: true,
    avatar_seed: 'Admin',
  });

  console.log(`✅ Admin created successfully!`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`\n   Run 'npm run seed' only once.`);
  process.exit(0);
})().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
