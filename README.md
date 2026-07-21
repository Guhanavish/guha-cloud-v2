# Cloud Storage Website

Personal cloud storage with user authentication, file upload/download, folder management, and 5GB storage per user.

## Tech Stack

- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: Vanilla HTML/CSS/JS
- **Auth**: JWT with HttpOnly cookies
- **File Upload**: Multer (local storage)
- **Security**: Helmet, CORS, Rate limiting, Mongo sanitize

## Features

- User registration & login with secure password hashing (bcrypt)
- JWT authentication with HttpOnly cookies
- File upload (up to 5GB per file)
- Folder creation, nesting, move, rename, delete
- File download, rename, move, delete
- Storage quota tracking (5GB per user)
- Search files by name
- Drag & drop upload with progress
- Responsive UI with context menus

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running locally or MongoDB Atlas URI

### Setup

```bash
cd cloud-storage

# Copy environment config
cp .env.example .env

# Edit .env with your settings (MongoDB URI, JWT secret, etc.)
# MONGODB_URI=mongodb://localhost:27017/cloud-storage
# JWT_SECRET=your-secret-key

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3000

### Production

```bash
NODE_ENV=production npm start
```

## Project Structure

```
cloud-storage/
├── public/
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── register.html       # Register page
│   ├── dashboard.html      # Main dashboard
│   ├── css/style.css       # Styles
│   └── js/
│       ├── auth.js         # Auth pages logic
│       └── dashboard.js    # Dashboard logic
├── src/
│   ├── server.js           # Entry point
│   ├── models/
│   │   ├── User.js         # User schema
│   │   ├── File.js         # File schema
│   │   └── Folder.js       # Folder schema
│   ├── routes/
│   │   ├── auth.js         # Auth endpoints
│   │   ├── files.js        # File endpoints
│   │   └── folders.js      # Folder endpoints
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── fileController.js
│   │   └── folderController.js
│   └── middleware/
│       ├── auth.js         # JWT verification
│       ├── upload.js       # Multer config
│       ├── validation.js   # Express-validator rules
│       └── errorHandler.js # Error handling
└── package.json
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/password` - Change password
- `DELETE /api/auth/account` - Delete account

### Files
- `POST /api/files/upload` - Upload files (multipart)
- `GET /api/files` - List files (paginated, searchable)
- `GET /api/files/stats` - Storage stats
- `GET /api/files/search` - Search files
- `GET /api/files/:id` - Get file info
- `GET /api/files/:id/download` - Download file
- `PUT /api/files/:id` - Rename file
- `PUT /api/files/:id/move` - Move file
- `DELETE /api/files/:id` - Delete file

### Folders
- `POST /api/folders` - Create folder
- `GET /api/folders` - List folders
- `GET /api/folders/:id` - Get folder
- `PUT /api/folders/:id` - Rename folder
- `PUT /api/folders/:id/move` - Move folder
- `DELETE /api/folders/:id` - Delete folder (recursive)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment |
| MONGODB_URI | mongodb://localhost:27017/cloud-storage | MongoDB connection |
| JWT_SECRET | (required) | JWT signing secret |
| JWT_EXPIRES_IN | 7d | Token expiry |
| SESSION_SECRET | (required) | Session secret |
| CLIENT_URL | http://localhost:3000 | CORS origin |
| MAX_FILE_SIZE | 5368709120 | Max file size (5GB) |
| ALLOWED_FILE_TYPES | * | Comma-separated MIME types |

## Security Notes

- Change `JWT_SECRET` and `SESSION_SECRET` in production
- Use HTTPS in production (set `secure: true` for cookies)
- Configure `ALLOWED_FILE_TYPES` to restrict uploads
- Set up MongoDB authentication
- Consider cloud storage (S3, etc.) for production file storage

## License

MIT