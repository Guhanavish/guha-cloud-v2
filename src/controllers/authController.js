const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const bcrypt = require('bcryptjs');

exports.login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return next(new AppError('Email/username and password required', 400));
    }

    const user = await User.findByIdentifier(identifier);
    
    if (!user) return next(new AppError('Invalid credentials', 401));
    
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return next(new AppError('Invalid credentials', 401));

    await User.update(user.id, { last_login: new Date().toISOString() });

    const token = generateToken(user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: User.getPublicProfile(user),
      token
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  res.json({ message: 'Logged out successfully' });
};

exports.getMe = async (req, res) => {
  res.json({ user: User.getPublicProfile(req.user) });
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { username, email } = req.body;
    const updates = {};

    if (username) updates.username = username;
    if (email) updates.email = email;

    if (Object.keys(updates).length === 0) {
      return next(new AppError('No fields to update', 400));
    }

    if (username) {
      const existing = await User.findByUsername(username);
      if (existing && existing.id !== req.user.id) {
        return next(new AppError('Username already taken', 400));
      }
    }

    if (email) {
      const existing = await User.findByEmail(email);
      if (existing && existing.id !== req.user.id) {
        return next(new AppError('Email already in use', 400));
      }
    }

    const user = await User.update(req.user.id, updates);
    res.json({ user: User.getPublicProfile(user) });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new AppError('Current and new password required', 400));
    }

    if (newPassword.length < 8) {
      return next(new AppError('New password must be at least 8 characters', 400));
    }

    const user = await User.findByIdWithPassword(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isMatch) {
      return next(new AppError('Current password is incorrect', 401));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await User.update(req.user.id, { password_hash: hashedPassword });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

exports.changeUsername = async (req, res, next) => {
  try {
    const { username } = req.body;

    if (!username || !username.trim()) {
      return next(new AppError('Username is required', 400));
    }

    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return next(new AppError('Username must be 3-30 characters', 400));
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return next(new AppError('Username can only contain letters, numbers, and underscores', 400));
    }

    const existingUser = await User.findByUsername(trimmed);
    if (existingUser && existingUser.id !== req.user.id) {
      return next(new AppError('Username already taken', 400));
    }

    const user = await User.update(req.user.id, { username: trimmed });
    res.json({ user: User.getPublicProfile(user) });
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    
    const user = await User.findByIdWithPassword(req.user.id);
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return next(new AppError('Password is incorrect', 401));
    }

    // Delete user (cascades to files and folders via FK)
    await User.delete(req.user.id);

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
};