# AssignHub — Academic Assignment Management System

Full-stack web app: HTML/CSS/JS frontend + Node.js/Express backend + PostgreSQL.

---

## Project Structure

```
assignhub/
├── backend/
│   ├── config/
│   │   ├── db.js            # PostgreSQL connection pool
│   │   ├── schema.sql       # Database schema (tables, indexes, triggers)
│   │   ├── setup-db.js      # Creates DB + applies schema
│   │   └── seed.js          # Seeds admin + sample data
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication + role guards
│   │   ├── upload.js        # Multer file upload config
│   │   └── errorHandler.js  # Global error handler
│   ├── routes/
│   │   ├── auth.js          # /api/auth/* (login, register, reset)
│   │   ├── assignments.js   # /api/assignments/*
│   │   ├── submissions.js   # /api/submissions/*
│   │   ├── users.js         # /api/users/*
│   │   ├── notifications.js # /api/notifications/*
│   │   └── analytics.js     # /api/analytics/*
│   ├── uploads/
│   │   ├── assignments/     # Assignment files uploaded by admin
│   │   └── submissions/     # Student submission files
│   ├── server.js            # Express app entry point
│   ├── package.json
│   └── .env                 # ← YOU MUST EDIT THIS
└── frontend/
    ├── api.js               # Shared API client (injected into all pages)
    ├── login.html
    ├── register.html
    ├── forgot-password.html
    ├── verify-email.html
    ├── admin-dashboard.html
    ├── admin-assignments.html
    ├── admin-submissions.html
    ├── admin-students.html
    ├── admin-registrations.html
    ├── admin-notifications.html
    ├── admin-analytics.html
    ├── admin-settings.html
    ├── student-dashboard.html
    ├── student-assignments.html
    ├── student-submissions.html
    ├── student-notifications.html
    └── student-settings.html
```

---

## Prerequisites

- **Node.js** v18+ (`node -v`)
- **PostgreSQL** v14+ (`psql --version`)

---

## Step 1 — Configure Environment

Edit `backend/.env`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/assignhub
JWT_SECRET=replace_with_64_random_chars
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@assignhub.edu
ADMIN_PASSWORD=Admin@123
FRONTEND_URL=http://localhost:5000
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760
NODE_ENV=development
```

Replace `YOUR_PASSWORD` with your PostgreSQL password.

---

## Step 2 — Install Dependencies

```bash
cd backend
npm install
```

---

## Step 3 — Setup Database

```bash
# From the backend/ directory:
npm run setup-db
```

This creates the `assignhub` PostgreSQL database and applies the full schema.

---

## Step 4 — Seed Sample Data

```bash
npm run seed
```

This creates:
- **Admin account**: `admin@assignhub.edu` / `Admin@123`
- **Student accounts**: `aarav.patel@university.edu` / `Student@123` (and 4 more)
- Sample assignments, submissions, and notifications

---

## Step 5 — Run the Application

```bash
npm start
```

Open **http://localhost:5000** in your browser.

---

## Login Credentials

| Role    | Email / Roll No              | Password     |
|---------|------------------------------|--------------|
| Admin   | admin@assignhub.edu          | Admin@123    |
| Student | aarav.patel@university.edu   | Student@123  |
| Student | sneha.iyer@university.edu    | Student@123  |
| Student | rohan.singh@university.edu   | Student@123  |

Students can also log in with their **roll number** (e.g., `23CS105`).

---

## API Endpoints

### Auth
| Method | Endpoint                      | Description              | Auth     |
|--------|-------------------------------|--------------------------|----------|
| POST   | /api/auth/register            | Student registration     | Public   |
| POST   | /api/auth/login               | Login (student or admin) | Public   |
| GET    | /api/auth/me                  | Get current user         | Required |
| POST   | /api/auth/forgot-password     | Request reset code       | Public   |
| POST   | /api/auth/verify-reset-token  | Verify OTP               | Public   |
| POST   | /api/auth/reset-password      | Set new password         | Public   |
| PUT    | /api/auth/profile             | Update profile           | Required |
| PUT    | /api/auth/change-password     | Change password          | Required |

### Assignments
| Method | Endpoint                        | Description              | Auth    |
|--------|---------------------------------|--------------------------|---------|
| GET    | /api/assignments                | List assignments         | Any     |
| GET    | /api/assignments/:id            | Get assignment           | Any     |
| POST   | /api/assignments                | Create (with file)       | Admin   |
| PUT    | /api/assignments/:id            | Update                   | Admin   |
| DELETE | /api/assignments/:id            | Delete                   | Admin   |
| GET    | /api/assignments/:id/download   | Download file            | Any     |

### Submissions
| Method | Endpoint                         | Description              | Auth    |
|--------|----------------------------------|--------------------------|---------|
| GET    | /api/submissions                 | List submissions         | Any     |
| GET    | /api/submissions/:id             | Get submission           | Any     |
| POST   | /api/submissions                 | Submit assignment        | Student |
| PUT    | /api/submissions/:id/grade       | Grade submission         | Admin   |
| GET    | /api/submissions/:id/download    | Download file            | Any     |

### Users
| Method | Endpoint                   | Description              | Auth    |
|--------|----------------------------|--------------------------|---------|
| GET    | /api/users                 | List users               | Admin   |
| GET    | /api/users/stats           | Dashboard stats          | Admin   |
| GET    | /api/users/student-stats   | Student's own stats      | Student |
| PATCH  | /api/users/:id/status      | Approve/suspend student  | Admin   |
| DELETE | /api/users/:id             | Remove student           | Admin   |

### Notifications
| Method | Endpoint                              | Auth    |
|--------|---------------------------------------|---------|
| GET    | /api/notifications                    | Any     |
| PATCH  | /api/notifications/:id/read           | Any     |
| PATCH  | /api/notifications/mark-all-read      | Any     |
| DELETE | /api/notifications/:id                | Any     |
| POST   | /api/notifications/broadcast          | Admin   |

### Analytics
| Method | Endpoint                          | Auth  |
|--------|-----------------------------------|-------|
| GET    | /api/analytics/overview           | Admin |
| GET    | /api/analytics/assignment/:id     | Admin |

---

## Features

### Students
- Register → wait for admin approval
- Login with email or roll number
- View active/upcoming assignments
- Submit files (PDF, Word, Excel, PowerPoint, zip, images)
- Track submission status and grades
- View notifications (grade alerts, deadlines)
- Update profile and password

### Admins
- Predefined admin account (seeded)
- Approve/reject student registrations
- Create assignments with file attachments
- View all submissions per assignment
- Grade submissions with score + feedback
- Broadcast notifications to all students
- Analytics dashboard (completion rate, scores, trends)
- Manage students (approve, suspend, remove)

### Security
- JWT tokens (7-day expiry)
- bcrypt password hashing (10 rounds)
- Role-based route guards (admin / student)
- Helmet security headers
- File type validation on upload
- SQL injection protection (parameterized queries)
- CORS configured

---

## Troubleshooting

**"Database connection failed"**
→ Check `DATABASE_URL` in `.env`. Ensure PostgreSQL is running: `pg_isready`

**"EADDRINUSE: port 5000"**
→ Change `PORT` in `.env` or kill the process on 5000.

**Student login shows "awaiting approval"**
→ Log in as admin → Admin Registrations → Approve the student.

**File upload fails**
→ Check `uploads/` directory exists and is writable. Max size is 10MB by default.

**Reset password OTP not received**
→ In development mode, the OTP is returned in the API response (`dev_token` field). Check browser DevTools → Network → forgot-password response.
