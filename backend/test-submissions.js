const mongoose = require('mongoose');
const Submission = require('./models/Submission');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/assignhub');
  console.log('Connected');
  
  const subs = await Submission.find({}).populate('assignment_id').lean().limit(1);
  console.log('Raw from DB:', subs);
  
  if (subs.length > 0) {
    const sub = subs[0];
    const shaped = {
      ...sub,
      id: sub._id.toString(),
      assignment_id: sub.assignment_id?._id ? sub.assignment_id._id.toString() : (sub.assignment_id ? sub.assignment_id.toString() : null),
    };
    console.log('Shaped assignment_id:', typeof shaped.assignment_id, shaped.assignment_id);
  }
  
  process.exit(0);
}
run();
